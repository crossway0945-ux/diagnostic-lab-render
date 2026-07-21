# V12.3.4 Diagnostic Precision — Release Manifest

Closes every blocking defect (D-1 … D-7) raised in the V12.3.3 production readiness audit.
No scoring rules, rubric, teaching frameworks, prices, build/start commands or provider prompt changed.

## Render Root Directory (unchanged, now documented correctly)

```
diagnostic-lab-v12-3-1-feedback-integrity-upload-ready/diagnostic-lab-v12-3-0-full-system-upgrade
```

Build `npm install` · Start `npm start` · Health `/api/health` · `DIAGNOSTIC_DATA_DIR=/var/data`

## D-1 — Taxonomy detectors failed on real provider prose

**Was:** `detectDevelopmentSignal` / `detectLanguageSignal` returned nothing for every real diagnosis
string in the shipped Sun PDF, so the provider's wrong heading passed straight through. Patterns had
been tuned against hand-written fixtures.

**Now:** both detectors classify from how diagnostic prose is actually written, in explicit precedence
order. Key additions:
- A sentence that "ends with a comma" / "feels unfinished" / "needs grammatical closure" is
  **Sentence Completion**, never Collocation.
- "unnatural", "unclear for", "imprecise", "needs precise … language", "cleaner terminology",
  "examiner has to infer" → **Lexical Precision**, never Word Form.
- "the SAR result should specify … more accurately", "the Result needs to move … to a wider pattern"
  → **SAR Example Quality**, never Countability.
- Collocation now outranks the bare word-class patterns ("the noun and preposition combination is
  unnatural" is a collocation defect, not a preposition defect).
- Article Control outranks Countability ("the article is missing before the singular countable noun").

## D-2 — Revision alignment false negative and self-contradicting card

**Was:** `evaluateRevisionAlignment` required `addedWords >= 4/5/6`, measured as net length growth
against the original. The shipped Body 1 expansion was *shorter* than the original, so all three
targets were reported unresolved and the v12.3.3 limitation note was appended to a revision whose own
rationale said it had expanded the mechanism — a direct contradiction on page 13 of the PDF.

**Now:**
- Development repair is judged from the content the revision introduces (`contentAdded`: at least
  three new content words), plus explicit detection of an affected group, a causal link and a
  consequence. Causation is recognised in participial form too ("leaving them tired",
  "forcing parents to adjust"), which is how natural academic English carries a mechanism.
- `addedWords` still drives *revision-type* selection, never target repair.
- A revision is only relabelled **Teacher-Guided Expansion** when it actually adds content; a word
  swap keeps its original type and receives the honest shortfall disclosure instead.
- The limitation note is never attached to a Teacher-Guided Expansion or Model Paragraph, so a card
  can no longer claim an expansion and deny writing the content in the same paragraph.

## D-3 — Executive Summary limiter with no Top Issue

**Was:** all five Top Issues came from Body 1 and the Conclusion while the summary named Body
Paragraph 2; the Body 2 development card had been given `High-Band Refinement`, which ranks below
`Moderate`, so it lost its slot to a `Minor Repair` conclusion item.

**Now:**
- A development, mechanism or SAR gap can never be `High-Band Refinement` / `Pass / Strong` /
  `Minor Repair`; it is floored at `Moderate` (`DEVELOPMENT_SEVERITY_FLOOR` repair is logged).
- `selectCanonicalTopIssueIds` guarantees coverage: any paragraph named in Main Score-Limiting Factor
  or Most Urgent Repair must appear in Top Issues. When the list is full the **lowest-severity**
  entry yields its slot, and an entry that is the sole representative of a required paragraph is
  never evicted. Existing ordering is otherwise untouched.

## D-4 — Paragraph status contradicted its own diagnosis

**Was:** Body Paragraph 2 shown as "Mostly Controlled" while the summary called its example "vague
and only partly convincing".

**Now:** status is capped by the weakest dimension — a paragraph holding a development-category issue
or any unresolved repair target can no longer be shown as `Strong` or `Mostly Controlled`.

## D-5 — Report copy defects

- Duplicate `Position and RoutePosition and Route` heading removed: the section keeps its `<h2>` and
  the callout now uses a distinct "Detected Route" / "เส้นทางที่ตรวจพบ" label.
- `projectRouteAlignmentDisplay` closes the route summary with a full stop before appending the scope
  note, fixing "…disagreement This rating assesses…".
- `LFC CPC` is rendered as **LFC-CPC** everywhere (display-level only; internal framework keys are
  unchanged, so no stored report or test fixture breaks).
- Space before a closing quotation mark or before punctuation is stripped ("traffic jam. ”" →
  "traffic jam."). Opening quotes keep their preceding space.

Applied in both `domain/canonicalAnalysis.js` (web + saved report) and `script.js` (print/PDF), so web
and PDF stay identical.

## D-6 — ZIP used backslash path separators

**Was:** `Compress-Archive` (PowerShell 5.1) wrote 67 of 94 entries with `\`, violating APPNOTE
4.4.17.1. `unzip` on Linux/macOS/CI silently dropped every subdirectory.

**Now:** the package is written by a spec-compliant writer that always emits `/`.
**Verified:** 0 backslash entries; `unzip` on POSIX tooling restores all directories
(domain 9, services 11, tests 19, schemas 2, scripts 5, reports 1, qa 2, netlify 2, assets 2);
`npm install && npm test` run from the extracted archive pass 18/18.
The writer also excludes `node_modules`, `.env` and all runtime data files.

## D-7 — render.yaml pointed at the wrong root

`rootDir` corrected to the full live path (see top of this file) and `ROOT_DIRECTORY_V12_3.txt`
rewritten with the exact value, the required folder layout and a post-deploy health check.
`tests/v12-3-full-system-upgrade.test.mjs` now asserts the corrected path.

## Versions

appVersion / engine / report / feedback-schema / issue-taxonomy / revision-validator → **12.3.4**.
`rubricVersion` (v12.3.0) and `promptVersion` (v12.3.1) unchanged.
Cache-bust token: `script.js?v=diagnostic-v12-3-4-diagnostic-precision`.

## Tests

New: `tests/v12-3-4-production-diagnosis-precision.test.mjs`. Its fixtures are **verbatim strings
from the production PDF**, precisely because hand-written fixtures are what let D-1 and D-2 ship.
It covers all six shipped diagnoses, five single-domain language controls, expansion fidelity on a
revision shorter than its original, the "no contradictory rationale" invariant, executive top-issue
coverage, dimensional paragraph status, all four copy fixes and the Render root.

`npm test` → **18 files passed**, run both in the working tree and again from the extracted ZIP.

## Verified sample (Sun urban zoning, local engine)

| Check | Result |
|---|---|
| Overall / TR / CC / LR / GRA | 6.0-6.5 / 6.5 / 6.0-6.5 / 6.0 / 6.0 — unchanged |
| Route Alignment | `Aligned` + scope note, correctly punctuated |
| Body Paragraph 2 in Top Issues | Yes — `Causal Mechanism`, severity Moderate |
| Body Paragraph 2 status | `Moderate` (no longer "Mostly Controlled") |
| Secondary language issue retained | `Countability` kept as secondary |
| Contradictory revision rationales | 0 |
| Fatal validation issues | 0 |

## Remaining limitation

Visual PDF rasterisation (overlap, clipping, orphan headings, footer collisions) still could not be
performed here: `pdftoppm` is not installed and the browser cannot open local PDFs. All text-level
copy defects found in the audit are fixed and covered by tests; the visual pass must be done by eye
on the first regenerated report after deploy.
