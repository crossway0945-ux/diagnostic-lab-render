# V12.9.7 Completion Summary

Status: local release validation complete; no deployment performed.

The authoritative source was `diagnostic-lab-v12.9.0-internal-validation.zip`, starting at package
version 12.9.0. The release version is 12.9.7. The rubric remains
`kru-pom-ielts-writing-v12.3.0`; no IELTS scoring rubric was changed.

The repair replaces inference-from-absence with an evidence contract for every positive framework
rating, aggregates SAR/support paragraph by paragraph, reconciles one canonical issue graph across
Top Issues, Detailed Feedback, Paragraph Coverage and the Repair Plan, applies the final report-value
threshold after all merges, separates mixed issue categories, and blocks internal identifiers and
forbidden Unicode from Student View and PDF output.

Final evidence:

- source check: 101 JavaScript modules passed;
- full suite: 41 test files passed;
- deterministic path: passed;
- authoritative provider-output replay: passed;
- live provider: blocked because no `OPENAI_API_KEY` was available in the local environment;
- Eva: 6.0–6.5, correct outweigh route, Position Clarity Strong with positive evidence, SAR Mixed;
- Evin: 6.5, correct route, logistical benefit recognised, environmental promise undeveloped,
  new car-dependency conclusion material detected;
- Sun: Problem & Solution, 6.5–7.0;
- Task 1 chart, map, process and mixed graph: passed without Task 2 SAR or required-conclusion leakage;
- actual browser print projection: Eva 13 pages, Evin 12 pages;
- PDF binary text extraction: pypdf and pdfplumber passed for every page;
- visual page inspection: 25/25 pages passed;
- no overflow, clipping, blank page, orphan heading, broken card, footer collision, internal ID or
  forbidden Unicode was found.

The wait message now tells the learner that analysis “may take a few minutes” and to keep the page
open.

Render settings for the preserved wrapper:

```text
Root Directory: diagnostic-lab-v12-8-0-upload-ready
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```
