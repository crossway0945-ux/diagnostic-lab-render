# V12.2 Full-System Upgrade - Release Verification

Generated: 2026-07-18T14:55:29.989Z

## Release decision

Local renderer, HTML, PDF, screenshot, text-layer, Unicode, progress-grouping and revision-fidelity QA passed. Production deployment and production smoke testing remain pending and are not claimed here.

## Root causes corrected

1. Uncontrolled layout: browser print flow was replaced by measured protected blocks composed into explicit A4 page containers after fonts load.
2. Ctrl+M overlay: client-profile printing was replaced by an isolated server-side Puppeteer context with extensions disabled and a temporary profile.
3. Internal QA leakage: StudentReportViewModel is an explicit projection; AdminReportQAViewModel is a separate internal object.
4. Text-layer corruption: embedded Thai/Latin webfonts, NFC sanitation, ccmp control, and PDF extraction gates are applied.
5. Version conflict: latest-essay versions are included only when every displayed version shares the current submissionGroupId; ambiguous mixed groups omit the student count.

## Architecture

- Student view model: StudentReportViewModel.v12
- Admin QA model: AdminReportQAViewModel.v12
- One authoritative template: reports/studentReportTemplate.js
- Server PDF route: authenticated /api/reports/:reportId/pdf
- Renderer: isolated Puppeteer browser with temporary userDataDir
- English pages: 13
- Thai pages: 12
- pdftotext available: yes

## Page-by-page QA

| Page | Sections / first content | Content Occupancy | Orphan Check | Split-Card Check | Overlay Check | Result |
|---|---|---:|---|---|---|---|
| EN-1 | KRU POM IELTS \| EVIDENCE-BASED WRITING DIAGNOSTIC / IELTS Writing 7+ Diagnostic Report | 100.0% | PASS | PASS | PASS | PASS |
| EN-2 | IELTS Criteria Breakdown / TASK RESPONSE | 97.3% | PASS | PASS | PASS | PASS |
| EN-3 | THESIS ROUTE CLARITY / Strong | 81.1% | PASS | PASS | PASS | PASS |
| EN-4 | Top Evidence-Based Issues / 1 | 80.3% | PASS | PASS | PASS | PASS |
| EN-5 | 3 / Body 1 Paragraph Closure and Link-Back | 100.0% | PASS | PASS | PASS | PASS |
| EN-6 | Thesis Route and Language Precision / Moderate | 94.1% | PASS | PASS | PASS | PASS |
| EN-7 | Revision Type: Route-Preserving Revision / Targeted Revision | 87.2% | PASS | PASS | PASS | PASS |
| EN-8 | Body 1 Example Development / Moderate | 98.4% | PASS | PASS | PASS | PASS |
| EN-9 | Revision Type: Route-Preserving Revision / Targeted Revision | 89.3% | PASS | PASS | PASS | PASS |
| EN-10 | Body 2 Explanation and Mechanism / Moderate | 100.0% | PASS | PASS | PASS | PASS |
| EN-11 | Revision Type: Teacher-Guided Expansion / Targeted Revision | 95.6% | PASS | PASS | PASS | PASS |
| EN-12 | Personalized 7-Day Repair Plan / Day 1 | 72.1% | PASS | PASS | PASS | PASS |
| EN-13 | Task 2 Progress Summary / PREVIOUS SUBMISSIONS | 63.5% | PASS | PASS | PASS | PASS |
| TH-1 | KRU POM IELTS \| EVIDENCE-BASED WRITING DIAGNOSTIC / รายงาน IELTS Writing 7+ Diagnostic | 100.0% | PASS | PASS | PASS | PASS |
| TH-2 | วิเคราะห์ตามเกณฑ์ IELTS / TASK RESPONSE | 99.4% | PASS | PASS | PASS | PASS |
| TH-3 | THESIS ROUTE CLARITY / Strong | 74.8% | PASS | PASS | PASS | PASS |
| TH-4 | ปัญหาหลักจากหลักฐานจริง / 1 | 80.3% | PASS | PASS | PASS | PASS |
| TH-5 | 3 / การพัฒนาตัวอย่าง Body 1 | 99.2% | PASS | PASS | PASS | PASS |
| TH-6 | ความแม่นยำของ Thesis Route / Moderate | 100.0% | PASS | PASS | PASS | PASS |
| TH-7 | Full-Response Grammatical and Sentence Control / Moderate | 94.2% | PASS | PASS | PASS | PASS |
| TH-8 | ประเภทการแก้: Teacher-Guided Expansion / Targeted Revision | 78.9% | PASS | PASS | PASS | PASS |
| TH-9 | ความแม่นยำของ Body 2 Topic Sentence / Moderate | 85.8% | PASS | PASS | PASS | PASS |
| TH-10 | ประเภทการแก้: Teacher-Guided Expansion / Targeted Revision | 87.2% | PASS | PASS | PASS | PASS |
| TH-11 | ความแม่นยำของ Conclusion และการปิด Route / Moderate | 97.4% | PASS | PASS | PASS | PASS |
| TH-12 | Day 5 / ตรวจ Grammar และ Sentence Ending | 90.2% | PASS | PASS | PASS | PASS |

## Text extraction QA

| Test String | PDF.js | pdftotext | Result |
|---|---|---|---|
| route-preserving revision | PASS | PASS | PASS |
| teacher-guided expansion | PASS | PASS | PASS |
| body paragraph 2 | PASS | PASS | PASS |
| conclusion | PASS | PASS | PASS |
| traffic congestion | PASS | PASS | PASS |
| paragraph closure | PASS | PASS | PASS |
| Full Thai Disclaimer | PASS | PASS | PASS |

## Unicode QA

- PDF.js English forbidden findings: 0
- PDF.js Thai forbidden findings: 0
- pdftotext structural form-feed separators are removed before the forbidden-content scan.
- U+FFFD/U+FFFE/U+FFFF findings: 0

## Progress QA

- latestSubmissionGroupId: sun-current
- valid version IDs: sun-v1, sun-v2
- excluded legacy groups: legacy-other
- representative report version: sun-v2
- distinct student submission count: 2
- previous range source: legacy-v1
- latest range source: sun-v2
- duplicate credit result: no-additional-credit

## Sun expected-versus-actual matrix

| Field | Expected | Actual | Result |
|---|---|---|---|
| Student | Sun | Sun | PASS |
| Task | Task 2 | Task 2 | PASS |
| Essay Type | Opinion Essay | Opinion Essay | PASS |
| Word Count | 254 | 254 | PASS |
| Estimated Overall Range | 6.0 | 6.0 | PASS |
| Writer Position | strongly disagree | strongly disagree | PASS |
| Task Response | 6.0-6.5 | 6.0-6.5 | PASS |
| Lexical Resource | 6.0 | 6.0 | PASS |
| Grammatical Range & Accuracy | 6.0 | 6.0 | PASS |

## Visual inspection status

- Screenshots generated for every English and Thai PDF page.
- DOM overlay scan passed: no iframe, fixed/sticky element, high-z-index helper or extension control.
- Protected quotation, revision, issue and repair cards remained inside page content bounds.
- Final disclaimer is not isolated on an otherwise empty page.

## Commands required before upload

- npm run check
- npm test
- npm run qa:report -- --output <directory>

## Deployment status

Not deployed by this QA run. Production login, official PDF download, Render log inspection and production text extraction must be completed after upload/deploy.

## Final clean-package verification

The final upload package was extracted to a new empty directory and tested from that extracted copy.

- Package version: 12.2.0
- Root folder: diagnostic-lab-v11-7-bilingual-premium
- Render build command: npm install
- Render start command: npm start
- npm install: PASS; 0 vulnerabilities
- npm run check: PASS
- npm test: PASS, including historical Task 1/Task 2/auth/ownership/quota/progress regressions, V12.2 diagnostic-integrity tests, and real bilingual PDF tests
- npm start: PASS
- GET /api/health: PASS; appVersion 12.2.0 and engineVersion ielts-diagnostic-engine-v12.2
- English sample PDF: 13 pages
- Thai sample PDF: 12 pages
- Every PDF page screenshot inspected through contact sheets
- PDF.js and pdftotext: PASS
- Forbidden Unicode: 0
- Ctrl+M and internal student-PDF identifiers: 0
- Runtime fixture hard-code scan: PASS

Production deployment is not claimed until the uploaded package is deployed on Render and tested through the live authenticated workflow.
