# V12.9.7 Live-Provider Validation Checklist

Local status: blocked because no `OPENAI_API_KEY` was available. Deterministic analysis and
authoritative provider-output replay passed; this checklist is the remaining external gate.

Run in a credentialed staging or production-equivalent environment without exposing the key:

1. Confirm `/api/health` reports app version 12.9.7, async-render mode and the intended model.
2. Analyze Eva's exact supplied submission once.
3. Confirm overall approximately Band 6.0, detected route
   `disadvantages outweigh the advantages`, Position Clarity Strong, Body Route Alignment supported,
   and SAR/Example Quality Mixed rather than falsely Strong.
4. Confirm Body Paragraph 1 support is recognised and Body Paragraph 2's development limitation is
   retained.
5. Export the Canonical QA JSON and compare issue category, diagnosis, action and revision for every
   visible issue.
6. Confirm no internal IDs, noncharacters, replacement glyphs or duplicated summary rows appear.
7. Export the PDF, extract its binary text and re-run the PDF text-integrity gate.
8. Run one explicit rerun and confirm one provider call, one new version, one charge, shared
   submission group and correct parent lineage.
9. Run two concurrent identical clicks and confirm provider collapse and exactly-once quota.
10. Record model, reasoning effort, timestamp, report ID and PASS/FAIL without recording the API key
    or full student essay in logs.

If any item fails, do not deploy the V12.9.7 release candidate.
