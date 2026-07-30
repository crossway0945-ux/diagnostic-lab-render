# V12.9.8 Inventory Diff

The deployed GitHub baseline is the `main` branch source root at
`diagnostic-lab-v12-9-0-taxonomy-agreement/diagnostic-lab-v12-8-0-upload-ready/`. The V12.9.7 full package is the Stop-Ship handoff baseline.
The V12.9.0 internal-validation ZIP is retained as the earlier full-package comparison.

No source, test, public/static asset or package-metadata file is deleted relative to the deployed GitHub source root.

## Deployed GitHub main baseline

- Unchanged: 92
- Modified: 35
- Added: 15
- Deleted: 0
- Renamed: 0

### Modified

- `domain/canonicalAnalysis.js`
- `domain/feedbackIntegrity.js`
- `domain/frameworkEvidence.js`
- `domain/paragraphEvidence.js`
- `domain/reportConsistency.js`
- `domain/sentenceCompleteness.js`
- `domain/task2RouteModel.js`
- `domain/task2Safety.js`
- `package-lock.json`
- `package.json`
- `qa/inspect-release-pdfs.py`
- `qa/render-release-pdfs.mjs`
- `script.js`
- `services/aiAnalyzer.js`
- `services/analysisVersions.js`
- `services/qaCanonicalExport.js`
- `tests/v11-2-report-integrity-hotfix.test.mjs`
- `tests/v11-3-report-completeness-hotfix.test.mjs`
- `tests/v11-4-pdf-traceability-progress-proof.test.mjs`
- `tests/v11-final-sale-readiness.test.mjs`
- `tests/v11-server-smoke.test.mjs`
- `tests/v12-3-1-feedback-integrity-hotfix.test.mjs`
- `tests/v12-3-2-taxonomy-revision-contract.test.mjs`
- `tests/v12-3-3-repairable-quality-gate.test.mjs`
- `tests/v12-3-4-production-diagnosis-precision.test.mjs`
- `tests/v12-3-5-revision-safety.test.mjs`
- `tests/v12-3-6-frontend-bootstrap.test.mjs`
- `tests/v12-3-full-system-upgrade.test.mjs`
- `tests/v12-4-0-engine-stabilisation.test.mjs`
- `tests/v12-4-1-analysis-reliability.test.mjs`
- `tests/v12-5-0-async-render.test.mjs`
- `tests/v12-6-0-global-feedback-integrity.test.mjs`
- `tests/v12-7-0-global-root-cause-correction.test.mjs`
- `tests/v12-8-0-output-integrity.test.mjs`
- `tests/v12-9-7-framework-evidence-contract.test.mjs`

### Added

- `CHANGED-FILES-MANIFEST.txt`
- `COMPLETION-SUMMARY.md`
- `FULL-FILE-INVENTORY.txt`
- `INVENTORY-DIFF.md`
- `MIGRATION.md`
- `PRODUCTION-SMOKE-TEST.md`
- `RELEASE-MANIFEST.md`
- `ROLLBACK.md`
- `SHA256SUMS.txt`
- `SOURCE-INVENTORY.json`
- `qa/build-browser-capture-pdf.py`
- `qa/build-stopship-acceptance-manifest.mjs`
- `qa/package-v12-9-8-release.py`
- `qa/render-stopship-acceptance-pdfs.mjs`
- `tests/v12-9-7-eva-paragraph-map-stopship.test.mjs`

### Deleted

- None

### Renamed

- None

### Unchanged

- `COMPLETION-SUMMARY-v12.9.7.md`
- `MIGRATION-v12.9.7.md`
- `PDF-PAGE-BY-PAGE-INSPECTION-v12.9.7.md`
- `PROVIDER-VALIDATION-CHECKLIST-v12.9.7.md`
- `RENDER_ENV_TEMPLATE.txt`
- `ROLLBACK-v12.9.7.md`
- `UPLOAD-SETTINGS-v12.9.7.txt`
- `UPLOAD_AND_RENDER_SETTINGS_V12_9_THAI.md`
- `V12_9_0_RELEASE_MANIFEST.md`
- `V12_9_1_RELEASE_MANIFEST.md`
- `V12_9_7_RELEASE_MANIFEST.md`
- `admin.html`
- `admin.js`
- `assets/fonts/Noto-Sans-Thai-LICENSE.txt`
- `assets/fonts/NotoSansThai-Variable.ttf`
- `domain/agreementValidator.js`
- `domain/canonicalDevelopmentEvidence.js`
- `domain/canonicalIntegrity.js`
- `domain/canonicalIssueGraph.js`
- `domain/deterministicCorrections.js`
- `domain/evidenceAssertions.js`
- `domain/index.js`
- `domain/issueContract.js`
- `domain/issueGraph.js`
- `domain/pdfRetry.js`
- `domain/pdfTextIntegrity.js`
- `domain/reportDensity.js`
- `domain/reportViewModels.js`
- `domain/revisionQuality.js`
- `domain/sentenceRoles.js`
- `domain/task1Classification.js`
- `domain/textIntegrity.js`
- `domain/thesisDimensions.js`
- `fixtures/v12-6-regression-corpus.json`
- `index.html`
- `netlify/functions/analyze-worker-background.js`
- `netlify/functions/api.js`
- `qa/build-release-artifacts.mjs`
- `qa/package-release.py`
- `render.yaml`
- `reports/reportGenerator.js`
- `schemas/canonicalIssueSchema.js`
- `schemas/task1Schema.js`
- `schemas/task2Schema.js`
- `scripts/build-static-preview.mjs`
- `scripts/check-source.mjs`
- `scripts/provider-matrix.mjs`
- `scripts/provider-preflight.mjs`
- `scripts/reset-diagnostic-data.mjs`
- `scripts/run-tests.mjs`
- `server.js`
- `services/adminSecurity.js`
- `services/analysisFailureLog.js`
- `services/analysisJobStore.js`
- `services/analysisWorker.js`
- `services/apiRouter.js`
- `services/canonicalAnalysis.js`
- `services/diagnosticReset.js`
- `services/diagnosticResponseSchema.js`
- `services/jobConfig.js`
- `services/jobDiagnostics.js`
- `services/kruPomRubricReference.js`
- `services/promptBuilder.js`
- `services/publicAssetGraph.js`
- `services/renderJobStore.js`
- `services/storage.js`
- `services/task2Safety.js`
- `styles.css`
- `tests/diagnostic-api.test.mjs`
- `tests/fixtures/task1-sun-combination-accepted.json`
- `tests/v10-commercial-sale-readiness.test.mjs`
- `tests/v11-1-language-calibration-hotfix.test.mjs`
- `tests/v11-6-student-report-renderer.test.mjs`
- `tests/v11-7-bilingual-premium-report.test.mjs`
- `tests/v12-5-0-cause-solution-classification.test.mjs`
- `tests/v12-8-1-final-consistency-gate.test.mjs`
- `tests/v12-8-2-canonical-qa-export.test.mjs`
- `tests/v12-8-3-canonical-integrity.test.mjs`
- `tests/v12-9-0-admin-security.test.mjs`
- `tests/v12-9-0-taxonomy-agreement.test.mjs`
- `tests/v12-9-1-admin-hardening.test.mjs`
- `tests/v12-9-1-canonical-consistency-gate.test.mjs`
- `tests/v12-9-1-route-semantics.test.mjs`
- `tests/v12-9-2-explicit-rerun.test.mjs`
- `tests/v12-9-3-report-integrity.test.mjs`
- `tests/v12-9-4-report-quality.test.mjs`
- `tests/v12-9-5-report-density.test.mjs`
- `tests/v12-9-6-paired-route-and-prose.test.mjs`
- `tests/v7-production-calibration.test.mjs`
- `tests/v8-2-opinion-route-progress.test.mjs`
- `tests/v8-sale-readiness.test.mjs`
- `wordCount.js`


## Previous full V12.9.0 internal-validation package

- Unchanged: 70
- Modified: 43
- Added: 29
- Deleted: 0
- Renamed: 0

### Modified

- `domain/canonicalAnalysis.js`
- `domain/canonicalDevelopmentEvidence.js`
- `domain/canonicalIntegrity.js`
- `domain/canonicalIssueGraph.js`
- `domain/evidenceAssertions.js`
- `domain/feedbackIntegrity.js`
- `domain/paragraphEvidence.js`
- `domain/pdfTextIntegrity.js`
- `domain/reportConsistency.js`
- `domain/reportDensity.js`
- `domain/sentenceCompleteness.js`
- `domain/task2RouteModel.js`
- `domain/task2Safety.js`
- `domain/textIntegrity.js`
- `package-lock.json`
- `package.json`
- `render.yaml`
- `script.js`
- `services/aiAnalyzer.js`
- `services/analysisVersions.js`
- `services/publicAssetGraph.js`
- `services/qaCanonicalExport.js`
- `tests/v11-2-report-integrity-hotfix.test.mjs`
- `tests/v11-3-report-completeness-hotfix.test.mjs`
- `tests/v11-4-pdf-traceability-progress-proof.test.mjs`
- `tests/v11-7-bilingual-premium-report.test.mjs`
- `tests/v11-final-sale-readiness.test.mjs`
- `tests/v11-server-smoke.test.mjs`
- `tests/v12-3-1-feedback-integrity-hotfix.test.mjs`
- `tests/v12-3-2-taxonomy-revision-contract.test.mjs`
- `tests/v12-3-3-repairable-quality-gate.test.mjs`
- `tests/v12-3-4-production-diagnosis-precision.test.mjs`
- `tests/v12-3-5-revision-safety.test.mjs`
- `tests/v12-3-6-frontend-bootstrap.test.mjs`
- `tests/v12-3-full-system-upgrade.test.mjs`
- `tests/v12-4-0-engine-stabilisation.test.mjs`
- `tests/v12-4-1-analysis-reliability.test.mjs`
- `tests/v12-5-0-async-render.test.mjs`
- `tests/v12-6-0-global-feedback-integrity.test.mjs`
- `tests/v12-7-0-global-root-cause-correction.test.mjs`
- `tests/v12-8-0-output-integrity.test.mjs`
- `tests/v12-9-5-report-density.test.mjs`
- `tests/v12-9-6-paired-route-and-prose.test.mjs`

### Added

- `CHANGED-FILES-MANIFEST.txt`
- `COMPLETION-SUMMARY-v12.9.7.md`
- `COMPLETION-SUMMARY.md`
- `FULL-FILE-INVENTORY.txt`
- `INVENTORY-DIFF.md`
- `MIGRATION-v12.9.7.md`
- `MIGRATION.md`
- `PDF-PAGE-BY-PAGE-INSPECTION-v12.9.7.md`
- `PRODUCTION-SMOKE-TEST.md`
- `PROVIDER-VALIDATION-CHECKLIST-v12.9.7.md`
- `RELEASE-MANIFEST.md`
- `ROLLBACK-v12.9.7.md`
- `ROLLBACK.md`
- `SHA256SUMS.txt`
- `SOURCE-INVENTORY.json`
- `UPLOAD-SETTINGS-v12.9.7.txt`
- `UPLOAD_AND_RENDER_SETTINGS_V12_9_THAI.md`
- `V12_9_7_RELEASE_MANIFEST.md`
- `domain/frameworkEvidence.js`
- `qa/build-browser-capture-pdf.py`
- `qa/build-release-artifacts.mjs`
- `qa/build-stopship-acceptance-manifest.mjs`
- `qa/inspect-release-pdfs.py`
- `qa/package-release.py`
- `qa/package-v12-9-8-release.py`
- `qa/render-release-pdfs.mjs`
- `qa/render-stopship-acceptance-pdfs.mjs`
- `tests/v12-9-7-eva-paragraph-map-stopship.test.mjs`
- `tests/v12-9-7-framework-evidence-contract.test.mjs`

### Deleted

- None

### Renamed

- None

### Unchanged

- `RENDER_ENV_TEMPLATE.txt`
- `V12_9_0_RELEASE_MANIFEST.md`
- `V12_9_1_RELEASE_MANIFEST.md`
- `admin.html`
- `admin.js`
- `assets/fonts/Noto-Sans-Thai-LICENSE.txt`
- `assets/fonts/NotoSansThai-Variable.ttf`
- `domain/agreementValidator.js`
- `domain/deterministicCorrections.js`
- `domain/index.js`
- `domain/issueContract.js`
- `domain/issueGraph.js`
- `domain/pdfRetry.js`
- `domain/reportViewModels.js`
- `domain/revisionQuality.js`
- `domain/sentenceRoles.js`
- `domain/task1Classification.js`
- `domain/thesisDimensions.js`
- `fixtures/v12-6-regression-corpus.json`
- `index.html`
- `netlify/functions/analyze-worker-background.js`
- `netlify/functions/api.js`
- `reports/reportGenerator.js`
- `schemas/canonicalIssueSchema.js`
- `schemas/task1Schema.js`
- `schemas/task2Schema.js`
- `scripts/build-static-preview.mjs`
- `scripts/check-source.mjs`
- `scripts/provider-matrix.mjs`
- `scripts/provider-preflight.mjs`
- `scripts/reset-diagnostic-data.mjs`
- `scripts/run-tests.mjs`
- `server.js`
- `services/adminSecurity.js`
- `services/analysisFailureLog.js`
- `services/analysisJobStore.js`
- `services/analysisWorker.js`
- `services/apiRouter.js`
- `services/canonicalAnalysis.js`
- `services/diagnosticReset.js`
- `services/diagnosticResponseSchema.js`
- `services/jobConfig.js`
- `services/jobDiagnostics.js`
- `services/kruPomRubricReference.js`
- `services/promptBuilder.js`
- `services/renderJobStore.js`
- `services/storage.js`
- `services/task2Safety.js`
- `styles.css`
- `tests/diagnostic-api.test.mjs`
- `tests/fixtures/task1-sun-combination-accepted.json`
- `tests/v10-commercial-sale-readiness.test.mjs`
- `tests/v11-1-language-calibration-hotfix.test.mjs`
- `tests/v11-6-student-report-renderer.test.mjs`
- `tests/v12-5-0-cause-solution-classification.test.mjs`
- `tests/v12-8-1-final-consistency-gate.test.mjs`
- `tests/v12-8-2-canonical-qa-export.test.mjs`
- `tests/v12-8-3-canonical-integrity.test.mjs`
- `tests/v12-9-0-admin-security.test.mjs`
- `tests/v12-9-0-taxonomy-agreement.test.mjs`
- `tests/v12-9-1-admin-hardening.test.mjs`
- `tests/v12-9-1-canonical-consistency-gate.test.mjs`
- `tests/v12-9-1-route-semantics.test.mjs`
- `tests/v12-9-2-explicit-rerun.test.mjs`
- `tests/v12-9-3-report-integrity.test.mjs`
- `tests/v12-9-4-report-quality.test.mjs`
- `tests/v7-production-calibration.test.mjs`
- `tests/v8-2-opinion-route-progress.test.mjs`
- `tests/v8-sale-readiness.test.mjs`
- `wordCount.js`


## V12.9.7 Stop-Ship handoff package

- Unchanged: 91
- Modified: 35
- Added: 16
- Deleted: 0
- Renamed: 0

### Modified

- `domain/canonicalAnalysis.js`
- `domain/feedbackIntegrity.js`
- `domain/frameworkEvidence.js`
- `domain/paragraphEvidence.js`
- `domain/reportConsistency.js`
- `domain/sentenceCompleteness.js`
- `domain/task2RouteModel.js`
- `domain/task2Safety.js`
- `package-lock.json`
- `package.json`
- `qa/inspect-release-pdfs.py`
- `qa/render-release-pdfs.mjs`
- `script.js`
- `services/aiAnalyzer.js`
- `services/analysisVersions.js`
- `services/qaCanonicalExport.js`
- `tests/v11-2-report-integrity-hotfix.test.mjs`
- `tests/v11-3-report-completeness-hotfix.test.mjs`
- `tests/v11-4-pdf-traceability-progress-proof.test.mjs`
- `tests/v11-final-sale-readiness.test.mjs`
- `tests/v11-server-smoke.test.mjs`
- `tests/v12-3-1-feedback-integrity-hotfix.test.mjs`
- `tests/v12-3-2-taxonomy-revision-contract.test.mjs`
- `tests/v12-3-3-repairable-quality-gate.test.mjs`
- `tests/v12-3-4-production-diagnosis-precision.test.mjs`
- `tests/v12-3-5-revision-safety.test.mjs`
- `tests/v12-3-6-frontend-bootstrap.test.mjs`
- `tests/v12-3-full-system-upgrade.test.mjs`
- `tests/v12-4-0-engine-stabilisation.test.mjs`
- `tests/v12-4-1-analysis-reliability.test.mjs`
- `tests/v12-5-0-async-render.test.mjs`
- `tests/v12-6-0-global-feedback-integrity.test.mjs`
- `tests/v12-7-0-global-root-cause-correction.test.mjs`
- `tests/v12-8-0-output-integrity.test.mjs`
- `tests/v12-9-7-framework-evidence-contract.test.mjs`

### Added

- `CHANGED-FILES-MANIFEST.txt`
- `COMPLETION-SUMMARY.md`
- `FULL-FILE-INVENTORY.txt`
- `INVENTORY-DIFF.md`
- `MIGRATION.md`
- `PRODUCTION-SMOKE-TEST.md`
- `RELEASE-MANIFEST.md`
- `ROLLBACK.md`
- `SHA256SUMS.txt`
- `SOURCE-INVENTORY.json`
- `UPLOAD_AND_RENDER_SETTINGS_V12_9_THAI.md`
- `qa/build-browser-capture-pdf.py`
- `qa/build-stopship-acceptance-manifest.mjs`
- `qa/package-v12-9-8-release.py`
- `qa/render-stopship-acceptance-pdfs.mjs`
- `tests/v12-9-7-eva-paragraph-map-stopship.test.mjs`

### Deleted

- None

### Renamed

- None

### Unchanged

- `COMPLETION-SUMMARY-v12.9.7.md`
- `MIGRATION-v12.9.7.md`
- `PDF-PAGE-BY-PAGE-INSPECTION-v12.9.7.md`
- `PROVIDER-VALIDATION-CHECKLIST-v12.9.7.md`
- `RENDER_ENV_TEMPLATE.txt`
- `ROLLBACK-v12.9.7.md`
- `UPLOAD-SETTINGS-v12.9.7.txt`
- `V12_9_0_RELEASE_MANIFEST.md`
- `V12_9_1_RELEASE_MANIFEST.md`
- `V12_9_7_RELEASE_MANIFEST.md`
- `admin.html`
- `admin.js`
- `assets/fonts/Noto-Sans-Thai-LICENSE.txt`
- `assets/fonts/NotoSansThai-Variable.ttf`
- `domain/agreementValidator.js`
- `domain/canonicalDevelopmentEvidence.js`
- `domain/canonicalIntegrity.js`
- `domain/canonicalIssueGraph.js`
- `domain/deterministicCorrections.js`
- `domain/evidenceAssertions.js`
- `domain/index.js`
- `domain/issueContract.js`
- `domain/issueGraph.js`
- `domain/pdfRetry.js`
- `domain/pdfTextIntegrity.js`
- `domain/reportDensity.js`
- `domain/reportViewModels.js`
- `domain/revisionQuality.js`
- `domain/sentenceRoles.js`
- `domain/task1Classification.js`
- `domain/textIntegrity.js`
- `domain/thesisDimensions.js`
- `fixtures/v12-6-regression-corpus.json`
- `index.html`
- `netlify/functions/analyze-worker-background.js`
- `netlify/functions/api.js`
- `qa/build-release-artifacts.mjs`
- `qa/package-release.py`
- `render.yaml`
- `reports/reportGenerator.js`
- `schemas/canonicalIssueSchema.js`
- `schemas/task1Schema.js`
- `schemas/task2Schema.js`
- `scripts/build-static-preview.mjs`
- `scripts/check-source.mjs`
- `scripts/provider-matrix.mjs`
- `scripts/provider-preflight.mjs`
- `scripts/reset-diagnostic-data.mjs`
- `scripts/run-tests.mjs`
- `server.js`
- `services/adminSecurity.js`
- `services/analysisFailureLog.js`
- `services/analysisJobStore.js`
- `services/analysisWorker.js`
- `services/apiRouter.js`
- `services/canonicalAnalysis.js`
- `services/diagnosticReset.js`
- `services/diagnosticResponseSchema.js`
- `services/jobConfig.js`
- `services/jobDiagnostics.js`
- `services/kruPomRubricReference.js`
- `services/promptBuilder.js`
- `services/publicAssetGraph.js`
- `services/renderJobStore.js`
- `services/storage.js`
- `services/task2Safety.js`
- `styles.css`
- `tests/diagnostic-api.test.mjs`
- `tests/fixtures/task1-sun-combination-accepted.json`
- `tests/v10-commercial-sale-readiness.test.mjs`
- `tests/v11-1-language-calibration-hotfix.test.mjs`
- `tests/v11-6-student-report-renderer.test.mjs`
- `tests/v11-7-bilingual-premium-report.test.mjs`
- `tests/v12-5-0-cause-solution-classification.test.mjs`
- `tests/v12-8-1-final-consistency-gate.test.mjs`
- `tests/v12-8-2-canonical-qa-export.test.mjs`
- `tests/v12-8-3-canonical-integrity.test.mjs`
- `tests/v12-9-0-admin-security.test.mjs`
- `tests/v12-9-0-taxonomy-agreement.test.mjs`
- `tests/v12-9-1-admin-hardening.test.mjs`
- `tests/v12-9-1-canonical-consistency-gate.test.mjs`
- `tests/v12-9-1-route-semantics.test.mjs`
- `tests/v12-9-2-explicit-rerun.test.mjs`
- `tests/v12-9-3-report-integrity.test.mjs`
- `tests/v12-9-4-report-quality.test.mjs`
- `tests/v12-9-5-report-density.test.mjs`
- `tests/v12-9-6-paired-route-and-prose.test.mjs`
- `tests/v7-production-calibration.test.mjs`
- `tests/v8-2-opinion-route-progress.test.mjs`
- `tests/v8-sale-readiness.test.mjs`
- `wordCount.js`

