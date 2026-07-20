import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const baseUrl = "http://127.0.0.1:4183/";
const outputDir = path.resolve("qa", "release-pdfs");
await mkdir(outputDir, { recursive: true });

const fixtures = [
  {
    student: "Sun V12.3.1 Final QA",
    language: "th",
    filename: "sun-thai-v12-3-1.pdf",
    prompt: "Towns and cities should be divided into zones so that all the schools are in one area, all the shopping malls are located together and all the industrial sites are situated close to each other.\n\nTo what extent do you agree that urban areas should be split into distinct zones?",
    writing: [
      "Some people may argue that towns and cities should be separated into zones, so all the same places are in the same area. However, I strongly disagree with the statement due to the lack of travel accessibility and traffic congestion.",
      "First of all, the clusterization of a specific place could lead to the difficulty of traveling. Every family is living in different places and distances, which could be very far away from their house, so it would be very difficult to travel through long distance. For instance, a student's house is very far away from his school, and it takes 3 hours to arrive there, so he needs to wake up at 5AM every morning, which lowers his energy and concentration in the class, resulting in bad grades. Therefore, when a certain place is clustered in one area, some people might encounter an issue of traveling,",
      "Furthermore, there would be more traffic congestion when a specific place is divided into a zone. Some places attract more people in some period of time, which could create a heavy traffic jam. For example, restaurants or shopping malls attract more people at breakfast, lunch, and dinner time; hence, people will be moving in the same direction at the same time, resulting in a large traffic congestion.",
      "In conclusion, I firmly believe that specific places like towns and cities should not be divided into zones, thus all the same places are in one area, since this could contribute to the difficulty in traveling and the congestion of traffic."
    ].join("\n\n")
  },
  {
    student: "Yuki V12.3.1 Final QA",
    language: "en",
    filename: "yuki-english-v12-3-1.pdf",
    prompt: "Some people think that spending a lot of money on space exploration is not worth it, and that this money should be used to solve problems on Earth instead. To what extent do you agree or disagree?",
    writing: [
      "Some people think that spending a lot of money on space exploration is not worth it, and that this money should be used to solve problems on Earth instead. While the opinion is valid, I partly disagree because space research also brings new technology, useful knowledge, and future opportunities that can help improve life on Earth in the long run.",
      "On one hand, it is true that many countries still face serious problems such as poverty, hunger, and poor healthcare. Millions of people do not have enough food, clean water, or proper education. In this situation, spending billions on rockets and satellites can seem wasteful. Governments could use that money to build hospitals, schools, and houses for people in need. These projects would make life better for people right away, instead of focusing on something far away in space.",
      "On the other hand, space exploration also brings useful results that help us in daily life. For example, satellites are used for weather forecasts, GPS, and communication, all of which come from space research. Studying space also helps scientists learn more about Earth's climate and how to protect it. Although it costs a lot of money, space technology can lead to new inventions and inspire young people to study science and technology, which helps society grow in the future.",
      "In conclusion, I believe that while it is important to solve the problems we have on Earth, investing in space exploration is still valuable. If countries spend money wisely, they can support both the needs of people today and the discoveries that will help us in the near future."
    ].join("\n\n")
  }
];

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addInitScript(() => {
  window.print = () => {};
  window.confirm = () => true;
});
const page = await context.newPage();
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.locator("#login-username").fill("qa-teacher");
await page.locator("#login-password").fill("qa-pass-123");
await page.locator("#login-button").click();
await page.locator("#report-root").waitFor({ state: "visible" });

const results = [];
for (const fixture of fixtures) {
  await page.locator('nav .nav-link[data-target="submission"]').click();
  await page.locator("#submission.active-view").waitFor();
  const studentSelect = page.locator("#student-profile-select");
  const options = await studentSelect.locator("option").allTextContents();
  if (!options.includes(fixture.student)) {
    await studentSelect.selectOption({ label: "+ Add new student" });
    await page.locator("#new-student-name").fill(fixture.student);
    await page.locator("#add-student-button").click();
    await studentSelect.selectOption({ label: fixture.student });
  } else {
    await studentSelect.selectOption({ label: fixture.student });
  }

  await page.locator("#essay-type").selectOption({ label: "Opinion Essay" });
  const reportLanguageInput = page.locator(`input[name="reportLanguage"][value="${fixture.language}"]`);
  await reportLanguageInput.evaluate((input) => {
    if (!input.checked) input.click();
  });
  await page.locator("#task2-prompt").fill(fixture.prompt);
  await page.locator("#task2-writing").fill(fixture.writing);
  await page.locator("#analyze-button").click();
  await page.locator("#dashboard.active-view").waitFor({ timeout: 20000 });
  await page.locator('nav .nav-link[data-focus="export-preview"]').click();
  await page.locator("#plan.active-view").waitFor();
  await page.locator('#diagnostic-print-frame').count().then(async (count) => {
    if (count) await page.locator('#diagnostic-print-frame').evaluate((frame) => frame.remove());
  });
  await page.getByRole("button", { name: "Export Diagnostic PDF", exact: true }).click();
  const frameElement = page.locator("#diagnostic-print-frame");
  await frameElement.waitFor({ state: "attached", timeout: 10000 });
  const frame = page.frames().find((item) => item !== page.mainFrame() && item.url() === "about:srcdoc");
  if (!frame) throw new Error(`Print frame missing for ${fixture.student}`);
  await frame.locator("#print-report").waitFor();
  await frame.evaluate(() => document.fonts?.ready);
  const html = await frame.content();

  const printPage = await context.newPage();
  await printPage.setContent(html, { waitUntil: "networkidle" });
  await printPage.emulateMedia({ media: "print" });
  await printPage.evaluate(() => document.fonts?.ready);
  const preflight = await printPage.evaluate(() => {
    const root = document.querySelector("#print-report");
    const protectedBlocks = [...document.querySelectorAll('[data-print-protected="true"]')];
    const printableHeightPx = (297 - 15 - 18) * (96 / 25.4);
    const oversized = protectedBlocks
      .map((element, index) => ({ index, height: element.getBoundingClientRect().height }))
      .filter((item) => item.height > printableHeightPx + 1);
    const text = root?.textContent || "";
    return {
      lang: document.documentElement.lang,
      textLength: text.length,
      protectedBlockCount: protectedBlocks.length,
      oversized,
      internalLeak: /(?:submissionGroupId|reportVersionId|parentReportId|inputFingerprint|engineVersion|rubricVersion|validationDetails|providerBodyPreview)/i.test(text),
      replacementCharacter: text.includes("�")
    };
  });
  if (preflight.internalLeak || preflight.replacementCharacter || preflight.oversized.length) {
    throw new Error(`PDF preflight failed for ${fixture.student}: ${JSON.stringify(preflight)}`);
  }
  const pdfPath = path.join(outputDir, fixture.filename);
  await printPage.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
  const pageCount = await printPage.locator(".pdf-sheet").count();
  results.push({ student: fixture.student, language: fixture.language, pdfPath, pageCount, preflight });
  await printPage.close();
}

await writeFile(path.join(outputDir, "client-flow-summary.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
console.log(JSON.stringify(results, null, 2));
await browser.close();
