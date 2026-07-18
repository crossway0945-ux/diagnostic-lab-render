# V12 Student Report Architecture - Release Verification

Generated: 2026-07-18T08:02:17.016Z

## Release decision

Local renderer, HTML, PDF, screenshot, text-layer, Unicode, progress-grouping and locked-revision QA passed. Production deployment and production smoke testing remain pending and are not claimed here.

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
- Thai pages: 13
- pdftotext available: yes

## Page-by-page QA

| Page | Sections / first content | Content Occupancy | Orphan Check | Split-Card Check | Overlay Check | Result |
|---|---|---:|---|---|---|---|
| EN-1 | KRU POM IELTS \| EVIDENCE-BASED WRITING DIAGNOSTIC / IELTS Writing 7+ Diagnostic Report | 92.7% | PASS | PASS | PASS | PASS |
| EN-2 | Position and Route / strongly disagree (high confidence) | 100.0% | PASS | PASS | PASS | PASS |
| EN-3 | Kru Pom Framework Breakdown / POSITION CLARITY | 88.6% | PASS | PASS | PASS | PASS |
| EN-4 | Top Evidence-Based Issues / 1 | 98.1% | PASS | PASS | PASS | PASS |
| EN-5 | 3 / Full-Response Grammatical and Sentence Control | 77.5% | PASS | PASS | PASS | PASS |
| EN-6 | 5 / Introduction, Thesis and Conclusion Precision | 91.2% | PASS | PASS | PASS | PASS |
| EN-7 | Revision Type: Route-Preserving Revision / Targeted Revision | 91.3% | PASS | PASS | PASS | PASS |
| EN-8 | Lexical Precision and Word Formation / Moderate | 96.3% | PASS | PASS | PASS | PASS |
| EN-9 | Revision Type: Route-Preserving Revision / Targeted Revision | 100.0% | PASS | PASS | PASS | PASS |
| EN-10 | Paragraph Closure and Link-Back / Moderate | 98.4% | PASS | PASS | PASS | PASS |
| EN-11 | Revision Type: Route-Preserving Revision / Targeted Revision | 100.0% | PASS | PASS | PASS | PASS |
| EN-12 | Conclusion Precision and Sentence Control / Moderate | 100.0% | PASS | PASS | PASS | PASS |
| EN-13 | Day 5 / Paragraph Closure Check | 100.0% | PASS | PASS | PASS | PASS |
| TH-1 | KRU POM IELTS \| EVIDENCE-BASED WRITING DIAGNOSTIC / รายงาน IELTS Writing 7+ Diagnostic | 88.5% | PASS | PASS | PASS | PASS |
| TH-2 | จุดยืนและเส้นทางการพัฒนา / strongly disagree (high ความมั่นใจ) | 100.0% | PASS | PASS | PASS | PASS |
| TH-3 | วิเคราะห์ตามกรอบ Kru Pom / POSITION CLARITY | 84.4% | PASS | PASS | PASS | PASS |
| TH-4 | ปัญหาหลักจากหลักฐานจริง / 1 | 96.1% | PASS | PASS | PASS | PASS |
| TH-5 | 3 / Full-Response Grammatical and Sentence Control | 73.4% | PASS | PASS | PASS | PASS |
| TH-6 | 5 / Introduction, Thesis and Conclusion Precision | 87.1% | PASS | PASS | PASS | PASS |
| TH-7 | ประเภทการแก้: Route-Preserving Revision / Targeted Revision | 89.3% | PASS | PASS | PASS | PASS |
| TH-8 | Lexical Precision and Word Formation / Moderate | 90.0% | PASS | PASS | PASS | PASS |
| TH-9 | ประเภทการแก้: Route-Preserving Revision / Targeted Revision | 91.3% | PASS | PASS | PASS | PASS |
| TH-10 | Paragraph Closure and Link-Back / Moderate | 90.0% | PASS | PASS | PASS | PASS |
| TH-11 | ประเภทการแก้: Route-Preserving Revision / Targeted Revision | 97.6% | PASS | PASS | PASS | PASS |
| TH-12 | Conclusion Precision and Sentence Control / Moderate | 99.6% | PASS | PASS | PASS | PASS |
| TH-13 | Day 5 / ตรวจ Paragraph Closure | 98.6% | PASS | PASS | PASS | PASS |

## Text extraction QA

| Test String | PDF.js | pdftotext | Result |
|---|---|---|---|
| full-language edit | PASS | PASS | PASS |
| route-preserving revision | PASS | PASS | PASS |
| two-body route | PASS | PASS | PASS |
| student-progress trends | PASS | PASS | PASS |
| traffic-congestion reason | PASS | PASS | PASS |
| teacher-guided expansion | PASS | PASS | PASS |
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
| Estimated Overall Range | 6.0-6.5 | 6.0-6.5 | PASS |
| Writer Position | strongly disagree | strongly disagree | PASS |
| Task Response | 6.5 | 6.5 | PASS |
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

## Final pre-upload package verification

- `npm ci` from a clean copy: PASS (0 audit vulnerabilities)
- `npm run check`: PASS
- Full `npm test`: PASS
- English PDF: 13 A4 pages; Thai PDF: 13 A4 pages
- Actual PDF raster inspection with PyMuPDF renderer: PASS
- Independent Poppler raster inspection: PASS
- PDF.js and pdftotext extraction: PASS
- Embedded Unicode fonts and tagged PDF checks: PASS
- Ctrl+M, extension overlays, internal IDs and forbidden Unicode findings: 0
- Final ZIP integrity and single-root-folder checks: PASS
- Exact ZIP extraction followed by clean `npm ci`, `npm run check` and full `npm test`: PASS
- Production deployment remains pending; this document does not claim a production smoke-test pass.
