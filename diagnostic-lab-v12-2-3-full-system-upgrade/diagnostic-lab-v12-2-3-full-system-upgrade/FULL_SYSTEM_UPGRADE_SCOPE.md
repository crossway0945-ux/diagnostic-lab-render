# V12.2.3 Full-System Upgrade Scope

## Diagnostic engine
- Canonical Task 1 and Task 2 analysis pipeline with trusted backend word count and task classification.
- Task 2 paragraph and sentence matching uses exact submitted evidence before feedback is retained.
- Opinion partial-position logic distinguishes a controlled concession from the writer-aligned body route.
- Conclusion checks position consistency, route closure, reference control, completion and language precision.
- Independent IELTS criterion estimates are reconciled conservatively into the reported range.
- Supported Task 2 families include Opinion, Discuss Both Views, Advantages/Disadvantages, Outweigh, Problem/Solution, Causes/Solutions, Causes/Effects, Positive/Negative Development, Direct Question and Hybrid prompts.
- Task 1 retains neutral reporting, overview, key-feature selection, grouping, comparison and data precision.

## Revision integrity
- Minimal Correction and Route-Preserving Revision cannot silently change the writer's position or argument route.
- Added premises must be labelled Teacher-Guided Expansion.
- Student-facing evidence must match a real submitted sentence and paragraph location.
- Production runtime contains no student-name switch and no exact full fixture-sentence switch.

## Student report and PDF
- Explicit StudentReportViewModel allowlist and separate AdminReportQAViewModel.
- One authoritative student HTML/PDF template.
- A4 premium layout with protected issue, quotation, revision and repair-plan blocks.
- Server-generated Puppeteer PDF with isolated browser context.
- Searchable/selectable English and Thai text, page numbers and internal-data leakage guards.
- Progress versions count only validated records belonging to the same submission group.

## Protected systems
Authentication, ownership, student profiles, quota/credit protection, duplicate handling, history, Task 1 fixtures and Task 2 regression fixtures remain covered by the test suite.
