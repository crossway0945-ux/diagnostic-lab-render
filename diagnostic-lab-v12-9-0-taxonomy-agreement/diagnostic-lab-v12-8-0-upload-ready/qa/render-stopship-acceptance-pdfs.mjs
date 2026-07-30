import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(here, "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((item) => {
    const separator = item.indexOf("=");
    return separator < 0
      ? [item.replace(/^--/, ""), true]
      : [item.slice(0, separator).replace(/^--/, ""), item.slice(separator + 1)];
  })
);
if (!args.output) {
  throw new Error("Usage: node qa/render-stopship-acceptance-pdfs.mjs --output=<dir> [--chrome=<path>]");
}

const outputDir = path.resolve(args.output);
await mkdir(outputDir, { recursive: true });

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    const relative = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname)
      .replace(/^[/\\]+/, "");
    const target = path.resolve(sourceRoot, relative);
    if (!target.toLowerCase().startsWith(sourceRoot.toLowerCase())) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    const body = await readFile(target);
    response.writeHead(200, {
      "content-type": mimeTypes[path.extname(target).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch({
  executablePath: args.chrome || process.env.CHROME_PATH || undefined,
  headless: true,
  args: ["--font-render-hinting=none"]
});

const runs = [];
try {
  for (const fixture of ["Eva", "Evin"]) {
    const analysis = JSON.parse(await readFile(path.join(outputDir, `${fixture}-render-input.json`), "utf8"));
    const appPage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await appPage.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
    const prepared = await appPage.evaluate(async (input) => {
      const { prepareDiagnosticPrintFrameForQa } = await import("/script.js");
      const frame = await prepareDiagnosticPrintFrameForQa(input);
      const doc = frame.contentDocument;
      if (!doc) throw new Error("The isolated print document was not created.");
      doc.documentElement.dataset.releaseQaReady = "true";
      const html = `<!doctype html>${doc.documentElement.outerHTML}`;
      const pages = [...doc.querySelectorAll(".pdf-sheet")];
      return {
        html,
        preparedPageCount: pages.length,
        paginationComplete: doc.querySelector("#print-report")?.dataset.paginationComplete === "true"
      };
    }, analysis);
    await appPage.close();

    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await page.setContent(prepared.html, { waitUntil: "networkidle", timeout: 60_000 });
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts?.ready);
    const metrics = await page.evaluate(() => {
      const sheets = [...document.querySelectorAll(".pdf-sheet")];
      const pageRows = sheets.map((sheet, index) => {
        const sheetRect = sheet.getBoundingClientRect();
        const content = sheet.querySelector(".pdf-sheet-content");
        const pageNumber = sheet.querySelector(".pdf-page-number");
        const numberRect = pageNumber?.getBoundingClientRect();
        const protectedBlocks = [...sheet.querySelectorAll(
          ".print-info,.print-card,.print-issue,.print-feedback-primary-group,.print-feedback-revision-group,.print-exact-evidence-group,.print-target-revision-group,.print-plan-item,.print-disclaimer"
        )];
        const clippedBlocks = protectedBlocks
          .filter((block) => {
            const rect = block.getBoundingClientRect();
            return rect.left < sheetRect.left - 1
              || rect.right > sheetRect.right + 1
              || rect.top < sheetRect.top - 1
              || rect.bottom > sheetRect.bottom + 1;
          })
          .map((block) => ({
            className: String(block.className || ""),
            text: String(block.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120)
          }));
        const headings = [...sheet.querySelectorAll("h1,h2,h3")]
          .map((heading) => String(heading.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean);
        const text = String(content?.innerText || "").replace(/\s+/g, " ").trim();
        const visibleElements = [...sheet.querySelectorAll("*")].filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        });
        const horizontalOverflow = visibleElements.reduce((max, element) => {
          const rect = element.getBoundingClientRect();
          return Math.max(max, rect.right - sheetRect.right, sheetRect.left - rect.left, 0);
        }, 0);
        const pageNumberCollision = Boolean(numberRect && protectedBlocks.some((block) => {
          const rect = block.getBoundingClientRect();
          return !(rect.right < numberRect.left
            || rect.left > numberRect.right
            || rect.bottom < numberRect.top
            || rect.top > numberRect.bottom);
        }));
        return {
          page: index + 1,
          numbering: String(pageNumber?.textContent || "").trim(),
          headings,
          textCharacters: text.length,
          blankOrNearEmpty: text.length < 80,
          contentClientHeight: content?.clientHeight || 0,
          contentScrollHeight: content?.scrollHeight || 0,
          verticalOverflowPx: Math.max(0, (content?.scrollHeight || 0) - (content?.clientHeight || 0)),
          horizontalOverflowPx: Number(horizontalOverflow.toFixed(2)),
          clippedBlocks,
          pageNumberCollision
        };
      });
      const text = String(document.body.innerText || "");
      return {
        pageCount: sheets.length,
        pageRows,
        bodyTextCharacters: text.length,
        internalIdLeak: /(?:priority-[a-z0-9-]+|submissionGroupId|reportVersionId|parentReportId|normalizedResponseFingerprint|legacy-[a-f0-9])/i.test(text),
        forbiddenUnicode: /[\uFDD0-\uFDEF\uFFFE\uFFFF\uD800-\uDFFF\u200B\u00AD]/u.test(text),
        paginationComplete: document.querySelector("#print-report")?.dataset.paginationComplete === "true"
      };
    });

    const baseName = `${fixture}-final-report`;
    await page.pdf({
      path: path.join(outputDir, `${baseName}.pdf`),
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: { top: "0", right: "0", bottom: "0", left: "0" }
    });
    await page.screenshot({ path: path.join(outputDir, `${baseName}-browser.png`), fullPage: true });
    await Promise.all([
      writeFile(path.join(outputDir, `${baseName}.html`), prepared.html, "utf8"),
      writeFile(path.join(outputDir, `${baseName}-browser-metrics.json`), `${JSON.stringify(metrics, null, 2)}\n`, "utf8")
    ]);
    runs.push({ fixture, prepared, metrics });
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

await writeFile(
  path.join(outputDir, "browser-render-summary.json"),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), runs }, null, 2)}\n`,
  "utf8"
);
console.log(JSON.stringify(runs.map(({ fixture, prepared, metrics }) => ({
  fixture,
  preparedPageCount: prepared.preparedPageCount,
  pageCount: metrics.pageCount,
  paginationComplete: prepared.paginationComplete && metrics.paginationComplete,
  internalIdLeak: metrics.internalIdLeak,
  forbiddenUnicode: metrics.forbiddenUnicode,
  blankPages: metrics.pageRows.filter((row) => row.blankOrNearEmpty).length,
  worstVerticalOverflowPx: Math.max(...metrics.pageRows.map((row) => row.verticalOverflowPx), 0),
  worstHorizontalOverflowPx: Math.max(...metrics.pageRows.map((row) => row.horizontalOverflowPx), 0),
  clippedBlocks: metrics.pageRows.reduce((sum, row) => sum + row.clippedBlocks.length, 0),
  pageNumberCollisions: metrics.pageRows.filter((row) => row.pageNumberCollision).length
})), null, 2));
