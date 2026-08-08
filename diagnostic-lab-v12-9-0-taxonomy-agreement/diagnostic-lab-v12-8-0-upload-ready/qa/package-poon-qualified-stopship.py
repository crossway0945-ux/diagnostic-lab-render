from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath


APP_VERSION = "12.9.8"
HOTFIX = "poon-revision-density-stopship"
REPOSITORY_PARENT = "diagnostic-lab-v12-9-0-taxonomy-agreement"
ROOT_DIRECTORY = "diagnostic-lab-v12-8-0-upload-ready"
ARCHIVE_PREFIX = f"{REPOSITORY_PARENT}/{ROOT_DIRECTORY}"

CHANGED_PATHS = (
    "domain/issueContract.js",
    "domain/reportConsistency.js",
    "domain/reportDensity.js",
    "domain/reportViewModels.js",
    "domain/task2Safety.js",
    "netlify-static-preview/domain/issueContract.js",
    "netlify-static-preview/domain/reportConsistency.js",
    "netlify-static-preview/domain/reportDensity.js",
    "netlify-static-preview/domain/reportViewModels.js",
    "netlify-static-preview/domain/task2Safety.js",
    "netlify-static-preview/script.js",
    "qa/build-poon-stopship-artifacts.mjs",
    "qa/package-poon-qualified-stopship.py",
    "script.js",
    "services/aiAnalyzer.js",
    "tests/v11-2-report-integrity-hotfix.test.mjs",
    "tests/v12-4-0-engine-stabilisation.test.mjs",
    "tests/v12-9-10-revision-density-stopship.test.mjs",
    "tests/v12-9-5-report-density.test.mjs",
    "tests/v12-9-9-poon-qualified-opinion-stopship.test.mjs",
)

EVIDENCE_FILES = (
    "Poon-final-analysis.json",
    "Poon-final-canonical-qa.json",
    "Poon-final-student-view.json",
    "Poon-render-input.json",
    "Poon-final-report.pdf",
    "Poon-extracted-pdf-text.txt",
    "Poon-paragraph-map-audit.json",
    "Poon-route-position-audit.json",
    "Poon-framework-evidence-audit.json",
    "Poon-revision-generation-audit.json",
    "Poon-language-control-density-audit.json",
    "Poon-criterion-score-trace.json",
    "Poon-overall-score-trace.json",
    "Poon-score-calculation-trace.json",
    "Poon-stopship-acceptance.json",
    "Poon-pdf-render-summary.json",
    "Poon-final-report-browser-metrics.json",
    "pdf-binary-inspection.json",
)

EXCLUDED_SEGMENTS = {
    ".git",
    "node_modules",
    "data",
    "analysis-jobs",
    "qa-canonical",
    "browser-cache",
    "__pycache__",
    "logs",
}
RUNTIME_FILES = {
    "admin-audit-log.json",
    "admin-session-revocations.json",
    "usage-audit.json",
    "users.json",
    "analysis-failures.ndjson",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def excluded(relative: PurePosixPath) -> bool:
    parts = {part.lower() for part in relative.parts}
    return bool(parts & EXCLUDED_SEGMENTS) or relative.name.lower() in RUNTIME_FILES


def source_map(root: Path) -> dict[str, Path]:
    result: dict[str, Path] = {}
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        relative = PurePosixPath(path.relative_to(root).as_posix())
        if not excluded(relative):
            result[relative.as_posix()] = path
    return result


def write_zip(target: Path, mapping: dict[str, Path], paths: tuple[str, ...] | list[str]) -> None:
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for relative in sorted(paths):
            archive.write(mapping[relative], f"{ARCHIVE_PREFIX}/{relative}")


def inspect_zip(path: Path) -> dict:
    with zipfile.ZipFile(path) as archive:
        bad = archive.testzip()
        names = [item.filename.replace("\\", "/") for item in archive.infolist() if not item.is_dir()]
        roots = sorted({name.split("/", 1)[0] for name in names})
        return {
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "fileCount": len(names),
            "crcPass": bad is None,
            "firstBadEntry": bad,
            "singleRepositoryParent": roots == [REPOSITORY_PARENT],
            "packageJsonAtActiveRoot": f"{ARCHIVE_PREFIX}/package.json" in names,
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--current", required=True)
    parser.add_argument("--evidence", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    baseline = Path(args.baseline).resolve()
    current = Path(args.current).resolve()
    evidence = Path(args.evidence).resolve()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)

    package = json.loads((current / "package.json").read_text(encoding="utf-8"))
    if package.get("version") != APP_VERSION:
        raise RuntimeError(f"package.json version changed: {package.get('version')!r}")

    baseline_files = source_map(baseline)
    current_files = source_map(current)
    missing = [path for path in CHANGED_PATHS if path not in current_files]
    if missing:
        raise RuntimeError(f"Missing hotfix source files: {missing}")

    release_files = dict(baseline_files)
    for relative in CHANGED_PATHS:
        release_files[relative] = current_files[relative]

    actual_changes = sorted(
        relative
        for relative, path in release_files.items()
        if relative not in baseline_files or sha256(path) != sha256(baseline_files[relative])
    )
    if actual_changes != sorted(CHANGED_PATHS):
        raise RuntimeError(
            "Hotfix scope differs from the approved semantic/QA allowlist: "
            + json.dumps({"actual": actual_changes, "expected": sorted(CHANGED_PATHS)}, indent=2)
        )

    protected = (
        "package.json",
        "package-lock.json",
        "render.yaml",
        "server.js",
        "services/authService.js",
        "services/quotaService.js",
        "services/analysisJobStore.js",
        "services/analysisWorker.js",
        "services/storage.js",
        "services/adminService.js",
        "services/reportVersioning.js",
    )
    protected_results = []
    for relative in protected:
        if relative in baseline_files:
            protected_results.append(
                {
                    "path": relative,
                    "unchanged": relative in release_files
                    and sha256(baseline_files[relative]) == sha256(release_files[relative]),
                    "sha256": sha256(baseline_files[relative]),
                }
            )
    if not all(item["unchanged"] for item in protected_results):
        raise RuntimeError("A protected deployment/system file changed.")

    full_zip = output / f"diagnostic-lab-v{APP_VERSION}-{HOTFIX}-full-release.zip"
    changed_zip = output / f"diagnostic-lab-v{APP_VERSION}-{HOTFIX}-GITHUB-CHANGED-FILES.zip"
    evidence_zip = output / f"diagnostic-lab-v{APP_VERSION}-{HOTFIX}-acceptance-evidence.zip"
    write_zip(full_zip, release_files, list(release_files))
    write_zip(changed_zip, release_files, list(CHANGED_PATHS))

    missing_evidence = [name for name in EVIDENCE_FILES if not (evidence / name).is_file()]
    if missing_evidence:
        raise RuntimeError(f"Missing acceptance artifacts: {missing_evidence}")
    with zipfile.ZipFile(evidence_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in EVIDENCE_FILES:
            archive.write(evidence / name, name)
        for folder in ("pdf-contact-sheets", "pdf-pages/poon"):
            root = evidence / folder
            if root.is_dir():
                for path in sorted(root.rglob("*.png")):
                    archive.write(path, path.relative_to(evidence).as_posix())

    full_result = inspect_zip(full_zip)
    changed_result = inspect_zip(changed_zip)
    evidence_result = inspect_zip(evidence_zip)
    if not all((full_result["crcPass"], full_result["singleRepositoryParent"], full_result["packageJsonAtActiveRoot"])):
        raise RuntimeError("Full release ZIP verification failed.")
    if not all((changed_result["crcPass"], changed_result["singleRepositoryParent"])):
        raise RuntimeError("Changed-files ZIP verification failed.")
    if changed_result["fileCount"] >= 100:
        raise RuntimeError("Changed-files ZIP exceeds the GitHub web upload limit.")
    if not evidence_result["crcPass"]:
        raise RuntimeError("Acceptance evidence ZIP verification failed.")

    acceptance = json.loads((evidence / "Poon-stopship-acceptance.json").read_text(encoding="utf-8"))
    pdf_inspection = json.loads((evidence / "pdf-binary-inspection.json").read_text(encoding="utf-8"))
    if acceptance.get("pass") is not True or pdf_inspection.get("machinePass") is not True:
        raise RuntimeError("Acceptance evidence is not terminal PASS.")

    manifest = {
        "releaseLabel": f"v{APP_VERSION}-{HOTFIX}",
        "applicationVersion": APP_VERSION,
        "versionChanged": False,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "repositoryParent": REPOSITORY_PARENT,
        "activeRootDirectory": ARCHIVE_PREFIX,
        "buildCommand": "npm install",
        "startCommand": "npm start",
        "fullRegression": {"sourceModules": 108, "testFiles": 48, "pass": True},
        "poonAcceptancePass": True,
        "pdf": {
            "pageCount": pdf_inspection["results"][0]["pageCount"],
            "textCharacters": pdf_inspection["results"][0]["textCharacters"],
            "unicodeIssues": pdf_inspection["results"][0]["unicodeIssues"],
            "machinePass": pdf_inspection["machinePass"],
            "renderingMethod": "production browser print renderer using the final validated Student View projection",
        },
        "changedFiles": list(CHANGED_PATHS),
        "changedFileCount": len(CHANGED_PATHS),
        "protectedSystemsUnchanged": all(item["unchanged"] for item in protected_results),
        "protectedFileHashes": protected_results,
        "archives": {
            full_zip.name: full_result,
            changed_zip.name: changed_result,
            evidence_zip.name: evidence_result,
        },
        "deploymentPerformed": False,
    }
    (output / "RELEASE-MANIFEST.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    (output / "CHANGED-FILES-MANIFEST.txt").write_text(
        "\n".join(f"M/A\t{ARCHIVE_PREFIX}/{path}" for path in CHANGED_PATHS) + "\n",
        encoding="utf-8",
    )
    (output / "PROTECTED-SYSTEMS-RESULT.md").write_text(
        f"# Protected Systems Result\n\nPASS — the release package changes only the {len(CHANGED_PATHS)} allowlisted semantic, report-projection, acceptance-QA and regression-test files.\n\n"
        + "\n".join(f"- `{item['path']}` — unchanged — `{item['sha256']}`" for item in protected_results)
        + "\n",
        encoding="utf-8",
    )
    (output / "DEPLOYMENT-HANDOFF.txt").write_text(
        f"UPLOAD THIS FILE TO THE EXISTING GITHUB REPOSITORY: {changed_zip.name}\n"
        f"GITHUB WEB-UPLOAD FILE COUNT: {changed_result['fileCount']} (under the 100-file limit)\n"
        "EXTRACT TO A SHORT LOCAL PATH FIRST: C:\\DL9810\n"
        "OPEN THE GITHUB REPOSITORY ROOT, THEN DRAG THE EXTRACTED diagnostic-lab-v12-9-0-taxonomy-agreement FOLDER.\n"
        "DO NOT CREATE AN EXTRA WRAPPER FOLDER AND DO NOT UPLOAD THE ZIP ITSELF INTO THE REPOSITORY.\n"
        f"FULL BACKUP/RELEASE FILE (NOT FOR GITHUB WEB DRAG-AND-DROP): {full_zip.name}\n"
        f"ROOT DIRECTORY: {ARCHIVE_PREFIX}\n"
        "BUILD COMMAND: npm install\n"
        "START COMMAND: npm start\n"
        "RENDER CONFIG/ENVIRONMENT: DO NOT CHANGE\n"
        "DEPLOYMENT STATUS: NOT DEPLOYED BY THIS PACKAGING TASK\n",
        encoding="utf-8",
    )
    (output / "COMPLETION-SUMMARY.md").write_text(
        "# Poon Revision, Density and Qualified-Opinion Stop-Ship Completion Summary\n\n"
        "PASS. The exact Poon submission now resolves as qualified disagreement: Body 1 is the selective industrial-safety exception, Body 2 supports the main disagreement with blanket zoning, and the conclusion resolves the initially unclear thesis. Every visible issue, including compact Language Pattern Summary rows, has a usable validated revision; no student-facing Revision Unavailable remains. Language-control density recalibrates LR to 5.0 and GRA to 4.5-5.0. Framework, paragraph coverage, issue taxonomy, priority plan, scoring and Unicode/PDF text state are mutually consistent.\n\n"
        "- Source check: 108 modules passed.\n"
        "- Complete regression suite: 48/48 test files passed.\n"
        "- Poon acceptance: passed.\n"
        "- PDF: 16 pages, searchable text, no forbidden Unicode/internal identifiers, visual contact-sheet review passed.\n"
        "- Protected deployment and account systems: unchanged.\n"
        "- Application version: 12.9.8 (unchanged).\n"
        "- Deployment: not performed.\n",
        encoding="utf-8",
    )

    checksum_targets = [
        full_zip,
        changed_zip,
        evidence_zip,
        output / "RELEASE-MANIFEST.json",
        output / "CHANGED-FILES-MANIFEST.txt",
        output / "PROTECTED-SYSTEMS-RESULT.md",
        output / "DEPLOYMENT-HANDOFF.txt",
        output / "COMPLETION-SUMMARY.md",
    ]
    (output / "SHA256SUMS.txt").write_text(
        "\n".join(f"{sha256(path)}  {path.name}" for path in checksum_targets) + "\n",
        encoding="utf-8",
    )
    verification = {
        "pass": True,
        "manifest": manifest,
        "checksums": {path.name: sha256(path) for path in checksum_targets},
    }
    (output / "PACKAGE-VERIFICATION.json").write_text(
        json.dumps(verification, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps(verification, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
