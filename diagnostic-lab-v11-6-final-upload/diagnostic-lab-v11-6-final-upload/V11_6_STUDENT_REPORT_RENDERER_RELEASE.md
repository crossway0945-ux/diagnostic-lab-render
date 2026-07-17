# V11.6 Student Report Renderer Release

This release changes only the student-facing report/PDF output layer and exact same-work version counting.

## Fixed

- PDF export now prints from an isolated iframe document instead of the live application page.
- Browser-extension overlays such as `Ctrl+M` are excluded from the official print document.
- Student PDF no longer renders report IDs, submission-group IDs, hashes, migration proof, or engine-rerun rows.
- Detailed feedback is split into protected evidence and revision groups to prevent orphan labels and split quote/revision boxes.
- Generated report text removes invalid control, soft-hyphen, zero-width and noncharacter code points.
- Print output uses the embedded Noto Sans Thai font before fallback fonts.
- Latest-essay version count includes only records with the exact current `submissionGroupId`; ambiguous legacy groups are excluded.
- Four Route-Preserving revisions were tightened to avoid unsupported intensity or category changes.

## Frozen

Task 1, Task 2 classification, scoring, route logic, criterion arithmetic, authentication, ownership, credits, pricing and word count were not changed.
