# V12.2.3 Full-System Upgrade Verification

## Exact deployment path

- Upload outer folder: `diagnostic-lab-v12-2-full-system-upgrade`
- Render Root Directory: `diagnostic-lab-v12-2-3-full-system-upgrade`
- Build: `npm install`
- Start: `npm start`
- Health: `/api/health`
- Node: `22.16.0`

## Root causes corrected

1. **Missing Render root** - the ZIP now contains both required folder levels and `package.json` at the exact configured nested path.
2. **Generic analysis failure** - structured report-language validation issues are normalized correctly; they no longer become `[object Object]` and trigger a false fatal gate.
3. **Incomplete provider output** - token headroom is 6000 with a structured-output retry up to 7500 tokens.
4. **Yuki route error** - partial disagreement is preserved; Body 1 is a controlled concession, Body 2 develops the writer-aligned case, and the conclusion remains balanced.
5. **Generic paragraph/report plan** - paragraph feedback uses exact paragraph functions and high-band reports receive focused refinements rather than a low-band repair template.
6. **False example diagnosis** - concrete, credible examples such as satellites used for forecasts, GPS and communication are not treated as failed SAR examples merely because of sentence length.
7. **PDF export stuck at Preparing** - the client has a 120-second abort, visible error restoration and PDF-response validation; the server has authenticated export, bounded Chromium launch/page/PDF timeouts, browser cache checks, logging and generated-PDF validation.
8. **Renderer quality** - explicit A4 composition, protected quotation/revision/issue/repair blocks, embedded bilingual fonts, searchable text, page numbers and strict Student/Admin projection.

## Automated verification

- `npm run check`: PASS
- `npm test`: PASS
- Historical Task 1/Task 2/auth/quota/ownership/progress fixtures: PASS
- V12.2.3 Yuki route/report regression: PASS
- `npm run qa:report -- --output <dir>`: PASS
  - English Sun report: 12 pages
  - Thai Sun report: 12 pages
  - PDF.js and pdftotext extraction: PASS
  - protected-card overflow: 0
  - internal data leakage: 0
  - forbidden Unicode: 0
- `npm run qa:yuki-api-pdf -- --output <pdf>`: PASS
  - login and student profile token: PASS
  - analysis API: 200
  - position: partly disagree
  - Body 1: controlled concession
  - Body 2: writer-aligned reason
  - saved report retrieval: PASS
  - official PDF API: 200 `application/pdf`
  - generated PDF: 6 pages, valid `%PDF` header, greater than 600 KB in the verified run

## Yuki report expectations

- Estimated range: 6.5-7.0
- Position: partly disagree, high confidence
- Thesis/route: controlled
- Body 1: valid opposing-case concession within the partial position
- Body 2: practical benefits of space research supporting the writer's disagreement
- Examples: relevant and credible
- Conclusion: strong closure; `near future` to `long run` is a high-band consistency refinement, not a structural failure
- Repair plan: thesis precision, concession role, Body 2 grouping, high-band language audit and conclusion time-frame consistency

## Production boundary

This verification covers local code, clean package, API flow and generated PDFs. A live Render deployment is not claimed until the uploaded commit is deployed and the authenticated production workflow is tested on the live domain.
