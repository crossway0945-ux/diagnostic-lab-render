# V12.9.7 PDF Page-by-Page Inspection

Method: actual browser print projection, Chrome PDF binary export, pypdf and pdfplumber extraction,
pypdfium2 rasterisation, and visual inspection of every rendered page. “Pass” means: no overflow,
clipping, blank/near-empty page, orphan heading, broken card, footer collision, numbering error,
forbidden Unicode, internal-ID leakage or copy/search failure.

Machine geometry for every page: 0 px vertical overflow, 0 px horizontal overflow, 0 clipped
protected blocks and 0 page-number collisions.

## Eva — 13 pages

| Page | Sections present | Visual/layout | Text/search/copy | Result |
| ---: | --- | --- | --- | --- |
| 1 | Cover, Executive Summary | Clean; no orphan or collision | Searchable; number 1/13; clean Unicode/IDs | PASS |
| 2 | Position and Route; IELTS Criteria | Clean two-column criteria layout | Searchable; number 2/13; clean Unicode/IDs | PASS |
| 3 | IELTS Criteria continuation; Framework start | Clean; no split card | Searchable; number 3/13; clean Unicode/IDs | PASS |
| 4 | Framework continuation | Clean; deliberate whitespace, not blank | Searchable; number 4/13; clean Unicode/IDs | PASS |
| 5 | Top Evidence-Based Issues | Three complete issue cards | Searchable; number 5/13; clean Unicode/IDs | PASS |
| 6 | Paragraph Coverage | Four complete paragraph cards | Searchable; number 6/13; clean Unicode/IDs | PASS |
| 7 | Detailed Feedback: comparative and thesis promise | Shared evidence shown once; cards intact | Searchable; number 7/13; clean Unicode/IDs | PASS |
| 8 | Detailed Feedback: causal mechanism | Complete protected card | Searchable; number 8/13; clean Unicode/IDs | PASS |
| 9 | Detailed Feedback: reference and lexical precision | Both cards intact | Searchable; number 9/13; clean Unicode/IDs | PASS |
| 10 | Detailed Feedback: agreement | Complete protected card | Searchable; number 10/13; clean Unicode/IDs | PASS |
| 11 | Detailed Feedback: agreement and sentence control | Dense page remains inside bounds | Searchable; number 11/13; clean Unicode/IDs | PASS |
| 12 | Seven-Day Repair Plan | Seven days visible; no broken tile | Searchable; number 12/13; clean Unicode/IDs | PASS |
| 13 | Progress Summary; Disclaimer | Footer clear; no collision | Searchable; number 13/13; clean Unicode/IDs | PASS |

Eva extracted text: 19,690 characters. pypdf and pdfplumber passed on all 13 pages.

## Evin — 12 pages

| Page | Sections present | Visual/layout | Text/search/copy | Result |
| ---: | --- | --- | --- | --- |
| 1 | Cover, Executive Summary | Clean; no orphan or collision | Searchable; number 1/12; clean Unicode/IDs | PASS |
| 2 | Position and Route; IELTS Criteria; Framework start | Clean; no split card | Searchable; number 2/12; clean Unicode/IDs | PASS |
| 3 | Framework continuation | Conclusion limiter and SAR labels agree with evidence | Searchable; number 3/12; clean Unicode/IDs | PASS |
| 4 | Top Evidence-Based Issues | Correct action on all three issues | Searchable; number 4/12; clean Unicode/IDs | PASS |
| 5 | Paragraph Coverage | Conclusion new-material repair retained | Searchable; number 5/12; clean Unicode/IDs | PASS |
| 6 | Detailed Feedback: comparative and thesis promise | Shared evidence shown once; cards intact | Searchable; number 6/12; clean Unicode/IDs | PASS |
| 7 | Detailed Feedback: conclusion closure | Complete protected card | Searchable; number 7/12; clean Unicode/IDs | PASS |
| 8 | Detailed Feedback: reference and lexical precision | Both cards intact | Searchable; number 8/12; clean Unicode/IDs | PASS |
| 9 | Detailed Feedback: grammar and reference | Both cards intact | Searchable; number 9/12; clean Unicode/IDs | PASS |
| 10 | Detailed Feedback: collocation; Language Patterns | No duplicate summary row | Searchable; number 10/12; clean Unicode/IDs | PASS |
| 11 | Seven-Day Repair Plan | Seven days visible; no broken tile | Searchable; number 11/12; clean Unicode/IDs | PASS |
| 12 | Progress Summary; Disclaimer | Footer clear; no collision | Searchable; number 12/12; clean Unicode/IDs | PASS |

Evin extracted text: 17,827 characters. pypdf and pdfplumber passed on all 12 pages.

Overall: 25/25 pages passed.
