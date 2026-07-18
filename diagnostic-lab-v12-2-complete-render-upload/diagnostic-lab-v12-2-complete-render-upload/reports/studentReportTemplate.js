import { escapeReportHtml } from "./textSanitization.js";
import { assertStudentReportViewModel } from "./studentReportViewModel.js";

export function renderStudentReportDocument(model, options = {}) {
  assertStudentReportViewModel(model);
  const title = `${model.reportHeader.title} - ${model.studentMetadata.student}`;
  const sourceBlocks = buildSourceBlocks(model);
  return `<!doctype html>
<html lang="${model.language === "th" ? "th" : "en"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${h(title)}</title>
  <style>${options.fontCss || ""}${REPORT_CSS}</style>
</head>
<body>
  <main id="report-output" aria-label="${h(model.reportHeader.title)}"></main>
  <section id="report-source" aria-hidden="true">${sourceBlocks}</section>
  <script>${paginationScript(model.footer)}</script>
</body>
</html>`;
}

export function renderStudentReportFragment(model) {
  assertStudentReportViewModel(model);
  return `<section class="student-report-fragment" lang="${model.language === "th" ? "th" : "en"}">${buildSourceBlocks(model)}</section>`;
}

function buildSourceBlocks(model) {
  const c = model.copy;
  const blocks = [];
  blocks.push(block("cover", coverBlock(model), "cover"));

  if (model.positionAndRoute) {
    blocks.push(sectionStart(c.positionAndRoute, routeCard(model.positionAndRoute)));
  }

  blocks.push(sectionStart(c.criteriaBreakdown, criterionCard(model.criteriaBreakdown[0])));
  model.criteriaBreakdown.slice(1).forEach((item) => blocks.push(block("criterion", criterionCard(item))));

  blocks.push(sectionStart(c.frameworkBreakdown, frameworkCard(model.frameworkBreakdown[0])));
  model.frameworkBreakdown.slice(1).forEach((item) => blocks.push(block("framework", frameworkCard(item))));

  if (model.topIssues.length) {
    blocks.push(sectionStart(c.topIssues, topIssueCard(model.topIssues[0], c)));
    model.topIssues.slice(1).forEach((item) => blocks.push(block("top-issue", topIssueCard(item, c))));
  }

  if (model.detailedFeedback.length) {
    const [first, ...rest] = model.detailedFeedback;
    blocks.push(sectionStart(c.detailedFeedback, feedbackGroupA(first, c), "feedback-a"));
    blocks.push(block("feedback-b", feedbackGroupB(first, c)));
    rest.forEach((card) => {
      blocks.push(block("feedback-a", feedbackGroupA(card, c)));
      blocks.push(block("feedback-b", feedbackGroupB(card, c)));
    });
  }

  if (model.repairPlan.length) {
    const firstChunk = model.repairPlan.slice(0, 4);
    const secondChunk = model.repairPlan.slice(4, 7);
    blocks.push(sectionStart(c.repairPlan, repairGrid(firstChunk), "repair-grid-block"));
    if (secondChunk.length) blocks.push(block("repair-grid-block", repairGrid(secondChunk), "repair-grid-block"));
  }

  if (model.progressSummary) {
    blocks.push(sectionStart(`${model.progressSummary.taskType} ${c.progressSummary}`, progressCard(model.progressSummary, c), "progress"));
  }

  blocks.push(sectionStart(c.disclaimer, `<div class="disclaimer-card"><p>${h(model.disclaimer)}</p></div>`, "disclaimer"));
  return blocks.join("");
}

function coverBlock(model) {
  const c = model.copy;
  const m = model.studentMetadata;
  return `<div class="report-cover">
    <header class="brand-header">
      <p>${h(model.reportHeader.eyebrow)}</p>
      <h1>${h(model.reportHeader.title)}</h1>
    </header>
    <div class="metadata-grid">
      ${info(c.student, m.student)}
      ${info(c.date, m.date)}
      ${info(c.taskType, m.taskType)}
      ${info(m.subtypeLabel, m.subtype)}
      ${info(c.wordCount, m.wordCount)}
      ${info(c.reportLanguage, m.reportLanguage)}
    </div>
    <div class="band-panel">
      <span>${h(c.estimatedBandRange)}</span>
      <strong>${h(model.estimatedBandRange)}</strong>
    </div>
    <section class="summary-panel">
      <h2>${h(c.executiveSummary)}</h2>
      ${callout(c.mainLimiter, model.executiveSummary.mainScoreLimitingFactor)}
      ${callout(c.urgentRepair, model.executiveSummary.mostUrgentRepair)}
      ${model.completionStatus ? callout(c.completionStatus, [model.completionStatus.status, ...model.completionStatus.evidence].filter(Boolean).join(" | ")) : ""}
      <p class="estimate-note">${model.language === "th" ? "ช่วงคะแนนนี้เป็นผลประเมินเชิง Diagnostic ไม่ใช่คะแนน IELTS ทางการ" : "Estimated range, not an official IELTS score."}</p>
    </section>
  </div>`;
}

function routeCard(route) {
  return `<article class="route-card"><strong>${h(route.position)}</strong><p>${h(route.summary)}</p></article>`;
}

function criterionCard(item) {
  return `<article class="criterion-card">
    <div class="card-heading"><span>${h(item.name)}</span><strong>${h(item.range)}</strong></div>
    <p>${h(item.diagnosis)}</p>
    ${item.evidence ? `<blockquote>${h(item.evidence, { preserveStudentText: true })}</blockquote>` : ""}
  </article>`;
}

function frameworkCard(item) {
  return `<article class="framework-card">
    <div class="card-heading"><span>${h(item.name)}</span><em class="status ${statusClass(item.status)}">${h(item.status)}</em></div>
    <p>${h(item.diagnosis)}</p>
  </article>`;
}

function topIssueCard(issue, c) {
  return `<article class="top-issue-card">
    <div class="issue-title-row"><b>${issue.number}</b><div><h3>${h(issue.title)}</h3><p><em class="status ${statusClass(issue.severity)}">${h(issue.severity)}</em> ${h(issue.criteria.join(", "))}</p></div></div>
    ${issue.framework.length ? `<p><strong>${h(c.framework)}:</strong> ${h(issue.framework.join(", "))}</p>` : ""}
    <p><strong>${h(c.evidenceScope)}:</strong> ${h(issue.scope)}</p>
    <p><strong>${h(c.paragraphLocations)}:</strong> ${h(issue.paragraphLocations.join("; ") || "-")}</p>
    ${issue.representativeEvidence ? `<p class="evidence-label"><strong>${h(c.representativeEvidence)}</strong></p>` : ""}
    <div class="evidence-list">${issue.evidenceItems.map((item) => `<div class="evidence-block"><p><strong>${h(item.paragraphLocation)}</strong>${item.evidenceRole ? ` - ${h(item.evidenceRole)}` : ""}</p><blockquote>${h(item.exactSentence, { preserveStudentText: true })}</blockquote></div>`).join("")}</div>
    ${issue.additionalEvidence ? `<p class="additional-evidence">${h(c.additionalEvidence)}</p>` : ""}
    <p><strong>${h(c.diagnosis)}:</strong> ${h(issue.diagnosis)}</p>
    <p><strong>${h(c.studentAction)}:</strong> ${h(issue.studentAction)}</p>
  </article>`;
}

function feedbackGroupA(card, c) {
  return `<article class="feedback-card feedback-primary">
    <div class="feedback-heading"><h3>${h(card.issueType)}</h3><em class="status ${statusClass(card.severity)}">${h(card.severity)}</em></div>
    <p><strong>${h(c.paragraphLocations)}:</strong> ${h(card.paragraphLocation)}</p>
    <div class="exact-evidence"><p><strong>${h(c.exactSentence)}</strong></p><blockquote>${h(card.exactSentence, { preserveStudentText: true })}</blockquote></div>
    <p><strong>${h(c.sentenceFunction)}:</strong> ${h(card.sentenceFunction)}</p>
    <p><strong>${h(c.whyLimits)}:</strong> ${h(card.whyItLimitsBand)}</p>
    <p><strong>${h(c.kruPomDiagnosis)}:</strong> ${h(card.kruPomDiagnosis)}</p>
  </article>`;
}

function feedbackGroupB(card, c) {
  return `<article class="feedback-card feedback-revision">
    <p><strong>${h(c.revisionType)}:</strong> ${h(card.revisionType)}</p>
    <div class="revision-box"><p><strong>${h(c.targetedRevision)}</strong></p><blockquote>${h(card.targetedRevision)}</blockquote></div>
    <p><strong>${h(c.whyStronger)}:</strong> ${h(card.whyRevisionIsStronger)}</p>
    <p><strong>${h(c.studentAction)}:</strong> ${h(card.studentAction)}</p>
  </article>`;
}

function repairDay(item) {
  return `<article class="repair-day"><span>Day ${h(item.day)}</span><div><h3>${h(item.title)}</h3><p>${h(item.task)}</p></div></article>`;
}

function repairGrid(items) {
  return `<div class="repair-grid">${items.map(repairDay).join("")}</div>`;
}

function progressCard(summary, c) {
  const metrics = [
    [c.previousSubmissions, String(summary.previousSubmissionCount)],
    [c.previousRange, summary.previousEstimatedRange],
    [c.latestRange, summary.latestEstimatedRange],
    [c.currentRepair, summary.currentMainRepair],
    [c.repeatedIssue, summary.repeatedIssue]
  ];
  if (summary.reportVersionCount !== null) metrics.push([c.reportVersions, String(summary.reportVersionCount)]);
  return `<article class="progress-card"><div class="progress-grid">${metrics.map(([label, value]) => info(label, value)).join("")}</div><p class="progress-note">${h(c.progressPolicy)}</p></article>`;
}

function sectionStart(title, firstContent, kind = "section-start") {
  return block(kind, `<section class="section-start"><div class="section-heading"><h2>${h(title)}</h2><span></span></div>${firstContent}</section>`);
}

function block(kind, html, className = "") {
  return `<div class="report-block ${className}" data-report-block="${h(kind)}">${html}</div>`;
}

function info(label, value) {
  return `<div class="info-card"><span>${h(label)}</span><strong>${h(value || "-")}</strong></div>`;
}
function callout(label, value) {
  return `<div class="summary-callout"><span>${h(label)}</span><p>${h(value || "-")}</p></div>`;
}
function statusClass(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("strong") || text.includes("complete")) return "strong";
  if (text.includes("moderate") || text.includes("mostly")) return "moderate";
  if (text.includes("critical") || text.includes("major")) return "critical";
  return "warning";
}
function h(value, options = {}) { return escapeReportHtml(value, options); }

function paginationScript(footerText) {
  const safeFooter = JSON.stringify(String(footerText || "Kru Pom IELTS | IELTS Writing 7+ Diagnostic Lab | Diagnostic estimate only"));
  return `(() => {
    const footerText = ${safeFooter};
    const source = document.getElementById('report-source');
    const output = document.getElementById('report-output');
    const fail = (message) => { document.documentElement.dataset.reportError = message; throw new Error(message); };
    const page = () => {
      const root = document.createElement('section');
      root.className = 'report-page';
      root.innerHTML = '<div class="page-content"></div><footer class="page-footer"><span></span><b></b></footer>';
      root.querySelector('.page-footer span').textContent = footerText;
      output.append(root);
      return root.querySelector('.page-content');
    };
    const fits = (container) => container.scrollHeight <= container.clientHeight + 1;
    const assertCleanDom = () => {
      if (source.querySelector('iframe, [style*="position:fixed"], [style*="position: fixed"], [style*="position:sticky"], [style*="position: sticky"]')) fail('Forbidden overlay-capable element detected.');
      const suspicious = [...source.querySelectorAll('*')].filter((element) => {
        const style = getComputedStyle(element);
        const zIndex = Number.parseInt(style.zIndex, 10);
        const signature = String(element.id || '') + ' ' + String(element.className || '');
        return element.shadowRoot || (Number.isFinite(zIndex) && zIndex >= 1000) || /assistant|shortcut|keyboard-helper|accessibility-toolbar|extension-control/i.test(signature);
      });
      if (suspicious.length) fail('Suspicious overlay or injected helper detected: ' + suspicious.slice(0, 3).map((element) => element.tagName + '.' + element.className).join(', '));
    };
    const compose = async () => {
      await document.fonts.ready;
      assertCleanDom();
      let container = page();
      const blocks = [...source.querySelectorAll(':scope > .report-block')];
      for (const original of blocks) {
        const clone = original.cloneNode(true);
        container.append(clone);
        if (!fits(container)) {
          clone.remove();
          if (!container.children.length) fail('Protected report block exceeds one A4 page: ' + original.dataset.reportBlock);
          container = page();
          container.append(clone);
          if (!fits(container)) fail('Protected report block exceeds one A4 page: ' + original.dataset.reportBlock);
        }
      }
      const pages = [...output.querySelectorAll('.report-page')];
      pages.forEach((item, index) => {
        item.querySelector('.page-footer b').textContent = (index + 1) + ' / ' + pages.length;
        const content = item.querySelector('.page-content');
        if (!fits(content)) fail('A4 page overflow at page ' + (index + 1));
        const children = [...content.children];
        const usedHeight = children.reduce((maximum, child) => Math.max(maximum, child.offsetTop + child.offsetHeight), 0);
        const ratio = Math.min(1, usedHeight / content.clientHeight);
        item.dataset.utilization = ratio.toFixed(3);
        if (index > 0 && index < pages.length - 1 && ratio < 0.30) fail('Avoidable low page utilization at page ' + (index + 1));
      });
      source.remove();
      document.documentElement.dataset.reportReady = 'true';
      window.__REPORT_READY__ = true;
      window.__REPORT_PAGE_COUNT__ = pages.length;
      window.__REPORT_LAYOUT_QA__ = pages.map((item, index) => ({ page: index + 1, utilization: Number(item.dataset.utilization) }));
    };
    compose().catch((error) => { window.__REPORT_ERROR__ = error.message; console.error(error); });
  })();`;
}

const REPORT_CSS = `
@page { size: A4 portrait; margin: 0; }
:root { --green:#123c35; --green2:#1f5c4b; --cream:#f7f1e6; --white:#fffdf8; --gold:#b88a44; --soft:#e8d3a2; --ink:#20201d; --muted:#6d675e; --border:#ded3c2; }
* { box-sizing:border-box; }
html, body { margin:0; padding:0; background:#d8d4cc; color:var(--ink); font-family:"Noto Sans Thai","Leelawadee UI","Arial",sans-serif; font-size:10.5pt; line-height:1.45; font-feature-settings:"ccmp" 0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { min-height:100vh; }
#report-source { position:absolute; left:-100000px; top:0; width:180mm; visibility:hidden; }
#report-output { display:block; }
.report-page { position:relative; width:210mm; height:297mm; margin:8mm auto; padding:17mm 15mm 18mm; overflow:visible; background:var(--cream); break-after:page; page-break-after:always; box-shadow:0 4mm 14mm rgba(0,0,0,.14); }
.report-page:last-child { break-after:auto; page-break-after:auto; }
.page-content { height:257mm; overflow:visible; }
.page-footer { position:absolute; left:15mm; right:15mm; bottom:7mm; display:flex; justify-content:space-between; align-items:center; border-top:.3mm solid var(--border); padding-top:1.7mm; color:var(--muted); font-size:8.1pt; }
.report-block { margin:0 0 3.2mm; break-inside:avoid; page-break-inside:avoid; }
.report-block:last-child { margin-bottom:0; }
.report-block.feedback-a { margin-bottom:1.6mm; }
.brand-header { border-bottom:.6mm solid var(--gold); padding-bottom:3.2mm; margin-bottom:3.6mm; }
.brand-header p { margin:0 0 1.5mm; color:var(--gold); font-size:8.5pt; font-weight:800; letter-spacing:.08em; }
.brand-header h1 { margin:0; color:var(--green); font-family:"Noto Serif Thai","Noto Serif","Georgia",serif; font-size:29pt; line-height:1.05; }
.metadata-grid,.progress-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:2.4mm; }
.info-card { min-height:15.2mm; padding:2.5mm 3mm; border:.3mm solid var(--border); border-radius:2mm; background:rgba(255,253,248,.72); }
.info-card span,.summary-callout span,.card-heading span { display:block; margin-bottom:.7mm; color:var(--gold); font-size:8.4pt; font-weight:900; letter-spacing:.04em; text-transform:uppercase; }
.info-card strong { color:var(--green); font-size:10.6pt; }
.band-panel { display:flex; justify-content:space-between; align-items:center; margin:3mm 0; padding:3mm 4mm; border-radius:2.5mm; background:var(--green); color:var(--white); }
.band-panel span { font-weight:800; }
.band-panel strong { color:var(--soft); font-family:"Noto Serif Thai","Noto Serif","Georgia",serif; font-size:23pt; }
.summary-panel,.route-card,.criterion-card,.framework-card,.top-issue-card,.feedback-card,.repair-day,.progress-card,.disclaimer-card { border:.3mm solid var(--border); border-radius:2.5mm; background:var(--white); box-shadow:0 1.2mm 3.2mm rgba(18,60,53,.055); }
.summary-panel { padding:3.5mm; }
.summary-panel h2,.section-heading h2 { margin:0; color:var(--green); font-family:"Noto Serif Thai","Noto Serif","Georgia",serif; font-size:21pt; line-height:1.15; }
.summary-callout { padding:2.2mm 0; border-bottom:.25mm solid var(--border); }
.summary-callout:last-of-type { border-bottom:0; }
.summary-callout p,.estimate-note { margin:0; }
.estimate-note { margin-top:2mm; color:var(--muted); font-size:8.5pt; }
.section-heading { margin:0 0 2.7mm; }
.section-heading span { display:block; width:100%; height:.45mm; margin-top:1.4mm; background:linear-gradient(90deg,var(--gold),rgba(184,138,68,.12)); }
.route-card,.criterion-card,.framework-card,.top-issue-card,.feedback-card,.progress-card,.disclaimer-card { padding:3.2mm; }
.route-card strong { display:block; color:var(--green); font-size:12.5pt; }
.route-card p,.criterion-card p,.framework-card p,.top-issue-card p,.feedback-card p,.progress-card p,.disclaimer-card p { margin:1.4mm 0 0; }
.card-heading,.feedback-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:3mm; }
.card-heading strong { color:var(--green); font-family:"Noto Serif Thai","Noto Serif","Georgia",serif; font-size:16.5pt; }
blockquote { margin:2mm 0 0; padding:2.4mm 3mm; border-left:1mm solid var(--gold); background:#fbf6ec; font-size:10.5pt; line-height:1.45; font-feature-settings:"ccmp" 0; font-style:normal; break-inside:avoid; page-break-inside:avoid; }
.status { display:inline-flex; align-items:center; min-height:5.5mm; padding:.45mm 2mm; border-radius:99px; background:#efe8dd; color:#5a5045; font-size:8.1pt; font-style:normal; font-weight:900; white-space:nowrap; }
.status.strong { background:#dcecdf; color:#255c3f; }.status.moderate { background:#f4ead0; color:#7b5c18; }.status.critical { background:#f6dddd; color:#8f302f; }
.issue-title-row { display:grid; grid-template-columns:8.5mm 1fr; gap:2.4mm; align-items:start; }
.issue-title-row > b { display:grid; place-items:center; width:7.6mm; height:7.6mm; border-radius:50%; background:var(--green); color:var(--soft); }
.issue-title-row h3,.feedback-heading h3,.repair-day h3 { margin:0; color:var(--green); font-family:"Noto Serif Thai","Noto Serif","Georgia",serif; font-size:14pt; line-height:1.18; }
.issue-title-row p { margin:.6mm 0 0; }
.evidence-label { margin-top:1.6mm !important; color:var(--green); }
.evidence-list { display:grid; gap:1.7mm; margin-top:1.5mm; }
.evidence-block { break-inside:avoid; page-break-inside:avoid; }
.evidence-block p { margin:0; }
.evidence-block blockquote { margin-top:1mm; }
.additional-evidence { color:var(--muted); font-size:8.7pt; font-style:italic; }
.exact-evidence,.revision-box { margin-top:1.8mm; break-inside:avoid; page-break-inside:avoid; }
.exact-evidence > p,.revision-box > p { margin:0; }
.feedback-primary { border-left:1.2mm solid var(--green2); border-radius:2.5mm 2.5mm 1.2mm 1.2mm; }
.feedback-revision { border-left:1.2mm solid var(--gold); border-radius:1.2mm 1.2mm 2.5mm 2.5mm; background:#fffcf5; }
.revision-box blockquote { background:#f5ead2; border-left-color:var(--green2); }
.repair-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:2.4mm; }
.repair-day { display:grid; grid-template-columns:14mm 1fr; gap:2.5mm; padding:2.7mm 3mm; break-inside:avoid; page-break-inside:avoid; }
.repair-day > span { display:grid; place-items:center; min-height:13mm; border-radius:2mm; background:var(--green); color:var(--soft); font-size:8.8pt; font-weight:900; }
.repair-day p { margin:.7mm 0 0; }
.progress-note { color:var(--muted); font-size:8.7pt; }
.closing-mark { padding:3mm; text-align:center; color:var(--green); border-top:.5mm solid var(--gold); }
@media print { html,body { background:#fff; } .report-page { margin:0; box-shadow:none; } }
`;
