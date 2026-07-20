# Feedback Integrity and Revision Alignment Hotfix

Production release: **12.3.1**. The requested documentation filename is retained for traceability, but the live codebase was already 12.3.0; therefore this hotfix is 12.3.1 rather than a downgrade to 12.2.4.

## Root causes

- Top Issues and detailed cards were normalized and localized independently, so the same evidence could receive conflicting labels or diagnoses.
- The browser renderer could pair a severity-ranked Top Issue with an essay-order detail card by array index; it now links by canonical `issueId` or exact evidence.
- Paragraph location existed, but there was no deterministic sentence-role taxonomy to reject opening-sentence/closure mismatches.
- Targeted revisions were checked for sentence safety, not against all repair targets implied by the diagnosis.
- Repeated-evidence counts were not represented by one auditable evidence-location array.
- Paragraph feedback displayed issue cards but did not explicitly prove that strong paragraphs had been checked.
- Conclusion Closure mixed functional closure with lexical and clause precision.
- Browser print export had no bounded recovery path for a transient closed target/session.
- Chromium's default Thai shaping produced visible text correctly but left null mappings for combining marks in the PDF text layer.

## Canonical issue model

`domain/feedbackIntegrity.js` creates one canonical issue per evidence-backed problem. Each object records stable `issueId`, task and paragraph identity, sentence index and role, stable issue taxonomy, severity, IELTS criteria, Kru Pom components, diagnosis, evidence scope/locations/count, revision type, repair targets and alignment result. Top Issues are projections of these same objects. Summary, urgent-repair, top and detailed linkage arrays contain canonical issue IDs.

## Sentence-role rules

Roles combine paragraph position, sentence position, discourse markers, punctuation, task/visual type and surrounding context. A linker alone does not determine role. Task 1 segmentation recognizes Introduction, Overview, body paragraphs and an unnecessary Task 1 Conclusion. Role/category conflicts are corrected before the issue is stored, and punctuation claims are checked against the exact quoted sentence.

## Revision alignment

The validator extracts repair targets and checks whether the proposed revision repairs each one. A local language repair can use Minimal Correction. Material explanation, mechanism, scope, SAR or consequence development requires Teacher-Guided Expansion or Model Paragraph. Major unresolved targets produce a feedback-integrity validation failure and use the existing single bounded structured-output retry; scores and evidence remain unchanged and no additional credit is deducted.

## Paragraph coverage and evidence transparency

Every detected paragraph receives a concise coverage row with function, controlled status, one diagnosis and either a priority repair or `No priority repair`. Single-location issues have count 1. Multi-location issues store and display primary plus additional exact occurrences; count must equal the evidence-location array.

## Conclusion taxonomy

Conclusion Closure now measures functional presence, completion, position/route preservation, contradiction and new-idea risk. Lexical, reference, clause and grammar precision remain under LR, GRA and LFC-CPC. No IELTS criterion-score calibration was changed.

## PDF retry

`domain/pdfRetry.js` retries exactly once only for known transient target, browser, session or isolated-print-frame failures. Each attempt creates a fresh isolated frame and disposes the failed frame. Invalid data, authentication, permissions and malformed requests are not retried. The retry uses the already rendered saved report and does not call analysis or quota code.

The print stylesheet disables PDF-only ligature/composition substitutions that corrupted Thai combining-mark mappings. Final Thai and English QA PDFs were verified with both `pypdf` and `pdfplumber/pdfminer`: A4 dimensions, every page footer, required report text, no null/replacement characters and no internal-field leakage all pass.

## Protected systems

Scoring calculations, Task 1 caps, Task 2 route/cap logic, authentication, sessions, roles, quota, duplicate cache, persistent storage, report ownership, secrets, pricing, package entitlement, Root Directory, Render commands, environment variables, custom domain and saved-report immutability were deliberately left intact. The rubric remains `kru-pom-ielts-writing-v12.3.0` to prove no broad recalibration.

## Regression coverage

The focused suite covers sentence roles, topic-sentence correction, punctuation correction, canonical Top/Detailed consistency, revision success/failure, evidence arrays, strong paragraph coverage, conclusion function separation, Task 1 overview/bar/map/process roles, and all four PDF retry outcomes. Historical Task 1/Task 2, account, quota, cache, progress, student renderer, PDF and server tests remain in the full suite.

## Known limitations

- Sentence roles are deterministic heuristics, not a full discourse parser; ambiguous sentences can remain `unknown` rather than receive an unsafe label.
- Client-side browser printing cannot verify that a user completes the operating-system print dialog. The app validates and retries preparation/print invocation only.
- Production smoke tests that create new analyses or deduct real credits must be run only after human approval; this package does not deploy automatically.

## Deployment contract

Keep the existing settings unchanged:

- Root Directory: `diagnostic-lab-v12-3-0-full-system-upgrade`
- Build Command: `npm install`
- Start Command: `npm start`
