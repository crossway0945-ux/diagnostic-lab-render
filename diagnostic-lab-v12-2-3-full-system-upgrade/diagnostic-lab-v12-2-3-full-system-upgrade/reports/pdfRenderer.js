import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { renderStudentReportDocument } from "./studentReportTemplate.js";
import { findForbiddenUnicode } from "./textSanitization.js";
import { getThaiDisclaimer } from "./studentReportViewModel.js";
import { getEmbeddedReportFontCss } from "./reportFonts.js";

const LAUNCH_ARGS = Object.freeze([
  "--disable-extensions",
  "--disable-component-extensions-with-background-pages",
  "--disable-default-apps",
  "--disable-sync",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--no-zygote",
  "--font-render-hinting=none"
]);

const PDF_TIMEOUT_MS = positiveInteger(process.env.PDF_GENERATION_TIMEOUT_MS, 110000);
const BROWSER_LAUNCH_TIMEOUT_MS = positiveInteger(process.env.PDF_BROWSER_LAUNCH_TIMEOUT_MS, 45000);
const PAGE_TIMEOUT_MS = positiveInteger(process.env.PDF_PAGE_TIMEOUT_MS, 60000);
let sharedBrowserPromise = null;

export async function generateStudentReportPdf(model, options = {}) {
  return withTimeout(generateStudentReportPdfInternal(model, options), PDF_TIMEOUT_MS, "PDF generation timed out before the document was ready.");
}

async function generateStudentReportPdfInternal(model, options = {}) {
  const browser = await getSharedBrowser();
  const context = await browser.createBrowserContext();
  let page;
  try {
    const fontCss = await getEmbeddedReportFontCss();
    const sourceHtml = renderStudentReportDocument(model, { fontCss });
    page = await context.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(PAGE_TIMEOUT_MS);
    await page.setViewport({ width: 1440, height: 1800, deviceScaleFactor: 1 });
    await page.setContent(sourceHtml, { waitUntil: "networkidle0", timeout: PAGE_TIMEOUT_MS });
    await page.waitForFunction(() => window.__REPORT_READY__ === true || Boolean(window.__REPORT_ERROR__), { timeout: PAGE_TIMEOUT_MS });

    const renderState = await page.evaluate(() => ({
      ready: window.__REPORT_READY__ === true,
      error: window.__REPORT_ERROR__ || "",
      pageCount: window.__REPORT_PAGE_COUNT__ || 0,
      layoutQA: window.__REPORT_LAYOUT_QA__ || [],
      text: document.body.innerText,
      pages: [...document.querySelectorAll(".report-page")].map((reportPage, index) => {
        const content = reportPage.querySelector(".page-content");
        const contentRect = content.getBoundingClientRect();
        const protectedSelectors = ["blockquote", ".revision-box", ".top-issue-card", ".repair-day", ".feedback-card"];
        const overflow = [...content.querySelectorAll(protectedSelectors.join(","))].filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.top < contentRect.top - 1 || rect.bottom > contentRect.bottom + 1;
        }).map((element) => element.className || element.tagName);
        return {
          page: index + 1,
          text: content.innerText,
          blockKinds: [...content.children].map((element) => element.dataset.reportBlock || ""),
          protectedOverflow: overflow,
          utilization: Number(reportPage.dataset.utilization || 0)
        };
      }),
      iframeCount: document.querySelectorAll("iframe").length,
      fixedOrSticky: [...document.querySelectorAll("*")].filter((element) => {
        const style = getComputedStyle(element);
        return style.position === "fixed" || style.position === "sticky";
      }).map((element) => element.tagName + "." + element.className).slice(0, 20)
    }));

    if (!renderState.ready || renderState.error) throw qaError(renderState.error || "Student report pagination did not complete.");
    if (!renderState.pageCount) throw qaError("Student report pagination returned zero pages.");
    if (renderState.iframeCount) throw qaError("Student report DOM contains an iframe.");
    if (renderState.fixedOrSticky.length) throw qaError(`Student report DOM contains fixed/sticky elements: ${renderState.fixedOrSticky.join(", ")}`);
    assertCleanText(renderState.text, model.language);
    const pageWithOverflow = renderState.pages.find((item) => item.protectedOverflow.length);
    if (pageWithOverflow) throw qaError(`Protected card overflow detected on page ${pageWithOverflow.page}: ${pageWithOverflow.protectedOverflow.join(", ")}`);

    const screenshots = [];
    if (options.captureScreenshots) {
      const pageElements = await page.$$(".report-page");
      for (const element of pageElements) {
        screenshots.push(Buffer.from(await element.screenshot({ type: "png", captureBeyondViewport: true })));
      }
    }

    const bytes = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      tagged: true,
      outline: true
    });
    const pdfBuffer = Buffer.from(bytes);
    if (pdfBuffer.length < 20000) throw qaError(`Generated PDF is unexpectedly small (${pdfBuffer.length} bytes).`);
    const pdfJsText = await extractPdfTextWithPdfJs(pdfBuffer);
    assertCleanText(pdfJsText, model.language);

    return {
      pdfBuffer,
      pageCount: renderState.pageCount,
      layoutQA: renderState.layoutQA,
      pdfJsText,
      sourceHtml: options.includeSourceHtml ? sourceHtml : undefined,
      pageQA: renderState.pages,
      screenshots: options.captureScreenshots ? screenshots : undefined
    };
  } catch (error) {
    if (/Target closed|browser has disconnected|Protocol error|Session closed/i.test(String(error?.message || ""))) {
      resetSharedBrowser();
    }
    if (!error.errorCode) error.errorCode = "PDF_GENERATION_FAILED";
    if (!error.statusCode) error.statusCode = /timed out/i.test(String(error.message || "")) ? 504 : 500;
    throw error;
  } finally {
    await page?.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

export async function warmupPdfRenderer() {
  const browser = await getSharedBrowser();
  return Boolean(browser?.connected);
}

export async function closePdfRendererBrowser() {
  const current = sharedBrowserPromise;
  sharedBrowserPromise = null;
  if (!current) return;
  try {
    const browser = await current;
    await browser.close();
  } catch {
    // The browser may already be disconnected during shutdown.
  }
}

async function getSharedBrowser() {
  if (!sharedBrowserPromise) {
    sharedBrowserPromise = launchSharedBrowser().catch((error) => {
      sharedBrowserPromise = null;
      throw error;
    });
  }
  const browser = await sharedBrowserPromise;
  if (!browser.connected) {
    resetSharedBrowser();
    return getSharedBrowser();
  }
  return browser;
}

async function launchSharedBrowser() {
  const puppeteerModule = await import("puppeteer");
  const puppeteer = puppeteerModule.default;
  const executablePath = await resolveChromiumExecutable(puppeteer);
  const browser = await withTimeout(puppeteer.launch({
    headless: true,
    executablePath,
    args: [...LAUNCH_ARGS],
    pipe: true,
    protocolTimeout: PAGE_TIMEOUT_MS + 15000
  }), BROWSER_LAUNCH_TIMEOUT_MS, "Chromium could not start in time for PDF generation.");
  browser.on("disconnected", () => {
    if (sharedBrowserPromise) sharedBrowserPromise = null;
  });
  return browser;
}

function resetSharedBrowser() {
  const current = sharedBrowserPromise;
  sharedBrowserPromise = null;
  current?.then((browser) => browser.close().catch(() => {})).catch(() => {});
}

export async function extractPdfTextWithPdfJs(pdfBuffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    disableFontFace: false,
    useSystemFonts: true,
    isEvalSupported: false
  });
  const document = await loadingTask.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    let pageText = "";
    for (const item of content.items) {
      pageText += item.str || "";
      if (item.hasEOL) pageText += "\n";
    }
    pages.push(pageText);
  }
  await loadingTask.destroy();
  return pages.join("\n---PAGE BREAK---\n").normalize("NFC");
}

export async function resolveChromiumExecutable(puppeteer) {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome"
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Continue to the next candidate.
    }
  }
  const bundled = puppeteer.executablePath();
  try {
    await access(bundled, fsConstants.X_OK);
    return bundled;
  } catch {
    const error = new Error(`Chromium executable was not found at ${bundled}. Run npm install again so Puppeteer can install its browser.`);
    error.errorCode = "PDF_BROWSER_NOT_INSTALLED";
    error.statusCode = 503;
    throw error;
  }
}

function assertCleanText(text, language) {
  const normalized = String(text || "").normalize("NFC");
  const forbiddenPatterns = [
    /Ctrl\s*\+\s*M/i,
    /submissionGroupId/i,
    /reportVersionId/i,
    /parentReportId/i,
    /normalizedResponseFingerprint/i,
    /engine\/report rerun excluded/i,
    /Progress policy/i,
    /implementation proof/i,
    /full￾language|route￾preserving|two￾body|student￾progress/i
  ];
  const match = forbiddenPatterns.find((pattern) => pattern.test(normalized));
  if (match) throw qaError(`Forbidden PDF/report text detected: ${match}`);
  const unicodeFindings = findForbiddenUnicode(normalized);
  if (unicodeFindings.length) throw qaError(`Forbidden Unicode detected: ${JSON.stringify(unicodeFindings.slice(0, 3))}`);
  if (language === "th") {
    const extractedComparable = normalized.normalize("NFKC").replace(/\s+/gu, "");
    const disclaimerComparable = getThaiDisclaimer().normalize("NFKC").replace(/\s+/gu, "");
    if (!extractedComparable.includes(disclaimerComparable)) {
      throw qaError("Thai disclaimer text did not survive the PDF text layer.");
    }
  }
}

function qaError(message) {
  const error = new Error(message);
  error.errorCode = "PDF_QA_FAILED";
  error.statusCode = 500;
  return error;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(message);
          error.errorCode = "PDF_GENERATION_TIMEOUT";
          error.statusCode = 504;
          reject(error);
        }, timeoutMs);
        timer.unref?.();
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
