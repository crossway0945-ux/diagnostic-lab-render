import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

// `NODE_PATH` is supplied by the workspace runtime. ESM package resolution intentionally ignores
// it, whereas createRequire honours it, so this keeps the release QA script dependency-free inside
// the production package while using the trusted bundled Playwright runtime.
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const args = Object.fromEntries(
  process.argv.slice(2).map((item) => {
    const separator = item.indexOf("=");
    return separator === -1
      ? [item.replace(/^--/, ""), true]
      : [item.slice(0, separator).replace(/^--/, ""), item.slice(separator + 1)];
  })
);

if (!args.output || !args.base) {
  throw new Error("Usage: node qa/render-release-pdfs.mjs --output=<dir> --base=<local URL>");
}

const outputDir = path.resolve(args.output);
const baseUrl = String(args.base).replace(/\/+$/, "");
const executablePath = args.chrome || process.env.CHROME_PATH || undefined;
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--font-render-hinting=none"]
});

const runs = [];
try {
  for (const fixture of ["eva", "evin"]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1
    });
    const url = `${baseUrl}/qa-print.html?fixture=${fixture}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForFunction(
      () => document.documentElement.dataset.releaseQaReady === "true",
      null,
      { timeout: 60_000 }
    );
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
        const visibleElements = [...sheet.querySelectorAll("*")]
          .filter((element) => {
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
        url: location.href,
        title: document.title,
        pageCount: sheets.length,
        pageRows,
        bodyTextCharacters: text.length,
        internalIdLeak: /(?:priority-[a-z0-9-]+|submissionGroupId|reportVersionId|parentReportId|normalizedResponseFingerprint|legacy-[a-f0-9])/i.test(text),
        forbiddenUnicode: /[\uFDD0-\uFDEF\uFFFE\uFFFF\uD800-\uDFFF\u200B\u00AD]/u.test(text),
        paginationComplete: document.querySelector("#print-report")?.dataset.paginationComplete === "true"
      };
    });

    const baseName = `${fixture[0].toUpperCase()}${fixture.slice(1)}-final-report`;
    await page.pdf({
      path: path.join(outputDir, `${baseName}.pdf`),
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: { top: "0", right: "0", bottom: "0", left: "0" }
    });
    await writeFile(
      path.join(outputDir, `${baseName}.html`),
      await page.content(),
      "utf8"
    );
    await page.screenshot({
      path: path.join(outputDir, `${baseName}-browser.png`),
      fullPage: true
    });
    await writeFile(
      path.join(outputDir, `${baseName}-browser-metrics.json`),
      `${JSON.stringify(metrics, null, 2)}\n`,
      "utf8"
    );
    runs.push({ fixture, pdf: `${baseName}.pdf`, metrics });
    await page.close();
  }
} finally {
  await browser.close();
}

await writeFile(
  path.join(outputDir, "browser-render-summary.json"),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, runs }, null, 2)}\n`,
  "utf8"
);
console.log(JSON.stringify(runs.map(({ fixture, pdf, metrics }) => ({
  fixture,
  pdf,
  pageCount: metrics.pageCount,
  paginationComplete: metrics.paginationComplete,
  internalIdLeak: metrics.internalIdLeak,
  forbiddenUnicode: metrics.forbiddenUnicode,
  worstVerticalOverflowPx: Math.max(...metrics.pageRows.map((row) => row.verticalOverflowPx), 0),
  worstHorizontalOverflowPx: Math.max(...metrics.pageRows.map((row) => row.horizontalOverflowPx), 0),
  clippedBlocks: metrics.pageRows.reduce((sum, row) => sum + row.clippedBlocks.length, 0),
  pageNumberCollisions: metrics.pageRows.filter((row) => row.pageNumberCollision).length
})), null, 2));
