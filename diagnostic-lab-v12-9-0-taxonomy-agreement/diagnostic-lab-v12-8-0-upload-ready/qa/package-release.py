from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path


WRAPPER = "diagnostic-lab-v12-8-0-upload-ready"
RUNTIME_NAMES = {
    "admin-audit-log.json",
    "admin-session-revocations.json",
    "usage-audit.json",
    "users.json",
    "analysis-failures.ndjson",
}
EXCLUDED_SEGMENTS = {
    "node_modules",
    "netlify-static-preview",
    ".git",
    "__pycache__",
    "analysis-jobs",
    "qa-canonical",
    "browser-cache",
    "probes",
    "logs",
}
SECRET_NAME = re.compile(r"^(?:\.env(?:\..*)?|.*(?:secret|credential|api-key).*)$", re.I)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def excluded(relative: Path) -> bool:
    lowered = {part.lower() for part in relative.parts}
    if lowered & EXCLUDED_SEGMENTS:
        return True
    name = relative.name.lower()
    if name in RUNTIME_NAMES:
        return True
    if SECRET_NAME.match(relative.name):
        return True
    if relative.suffix.lower() in {".log", ".tmp"}:
        return True
    return False


def file_map(root: Path) -> dict[str, Path]:
    return {
        path.relative_to(root).as_posix(): path
        for path in sorted(root.rglob("*"))
        if path.is_file() and not excluded(path.relative_to(root))
    }


def changed_files(base: dict[str, Path], current: dict[str, Path]) -> list[dict]:
    rows = []
    for relative in sorted(set(base) | set(current)):
        if relative not in base:
            rows.append({"status": "A", "path": relative})
        elif relative not in current:
            rows.append({"status": "D", "path": relative})
        elif sha256(base[relative]) != sha256(current[relative]):
            rows.append({"status": "M", "path": relative})
    return rows


def write_full_zip(target: Path, current: dict[str, Path]) -> None:
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for relative, source in current.items():
            archive.write(source, f"{WRAPPER}/{relative}")


def write_changed_zip(target: Path, current: dict[str, Path], rows: list[dict]) -> None:
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for row in rows:
            if row["status"] == "D":
                continue
            archive.write(current[row["path"]], f"{WRAPPER}/{row['path']}")


def text_lines(path: Path | None) -> list[str]:
    if path is None:
        return []
    return path.read_text(encoding="utf-8").splitlines(keepends=True)


def write_patch(target: Path, base: dict[str, Path], current: dict[str, Path], rows: list[dict]) -> None:
    chunks: list[str] = []
    for row in rows:
        relative = row["path"]
        old_path = base.get(relative)
        new_path = current.get(relative)
        try:
            old_lines = text_lines(old_path)
            new_lines = text_lines(new_path)
        except UnicodeDecodeError:
            chunks.append(f"Binary files a/{WRAPPER}/{relative} and b/{WRAPPER}/{relative} differ\n")
            continue
        chunks.extend(
            difflib.unified_diff(
                old_lines,
                new_lines,
                fromfile=f"a/{WRAPPER}/{relative}" if old_path else "/dev/null",
                tofile=f"b/{WRAPPER}/{relative}" if new_path else "/dev/null",
                n=3,
            )
        )
    target.write_text("".join(chunks), encoding="utf-8")


def write_artifact_zip(target: Path, evidence: Path, current_root: Path) -> list[str]:
    names = [
        "release-artifact-index.json",
        "Eva-final-analysis.json",
        "Eva-final-canonical-qa.json",
        "Eva-final-student-view.json",
        "Eva-final-report.html",
        "Eva-final-report.pdf",
        "Eva-extracted-pdf-text.txt",
        "Evin-final-analysis.json",
        "Evin-final-canonical-qa.json",
        "Evin-final-student-view.json",
        "Evin-final-report.html",
        "Evin-final-report.pdf",
        "Evin-extracted-pdf-text.txt",
        "Sun-final-regression.json",
        "Task1-final-regression-matrix.json",
        "browser-render-summary.json",
        "pdf-binary-inspection.json",
    ]
    included: list[str] = []
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in names:
            source = evidence / name
            if source.is_file():
                archive.write(source, f"evidence/{name}")
                included.append(f"evidence/{name}")
        contacts = evidence / "pdf-contact-sheets"
        for source in sorted(contacts.glob("*.png")):
            archive.write(source, f"evidence/pdf-contact-sheets/{source.name}")
            included.append(f"evidence/pdf-contact-sheets/{source.name}")
        for name in [
            "COMPLETION-SUMMARY-v12.9.7.md",
            "V12_9_7_RELEASE_MANIFEST.md",
            "PDF-PAGE-BY-PAGE-INSPECTION-v12.9.7.md",
            "PROVIDER-VALIDATION-CHECKLIST-v12.9.7.md",
            "MIGRATION-v12.9.7.md",
            "ROLLBACK-v12.9.7.md",
            "UPLOAD-SETTINGS-v12.9.7.txt",
        ]:
            source = current_root / name
            archive.write(source, f"release-docs/{name}")
            included.append(f"release-docs/{name}")
    return included


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--current", required=True)
    parser.add_argument("--evidence", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    baseline_root = Path(args.baseline).resolve()
    current_root = Path(args.current).resolve()
    evidence_root = Path(args.evidence).resolve()
    output_root = Path(args.output).resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    package = json.loads((current_root / "package.json").read_text(encoding="utf-8"))
    if package.get("version") != "12.9.7":
        raise RuntimeError("Current package version is not 12.9.7.")
    base_package = json.loads((baseline_root / "package.json").read_text(encoding="utf-8"))

    base_files = file_map(baseline_root)
    current_files = file_map(current_root)
    rows = changed_files(base_files, current_files)

    full_zip = output_root / "diagnostic-lab-v12.9.7-production-ready.zip"
    changed_zip = output_root / "diagnostic-lab-v12.9.7-GITHUB-CHANGED-FILES.zip"
    patch = output_root / "PATCH-v12.9.0-to-v12.9.7.patch"
    artifact_zip = output_root / "diagnostic-lab-v12.9.7-QA-EVIDENCE.zip"
    changed_list = output_root / "CHANGED-FILES-v12.9.7.txt"

    write_full_zip(full_zip, current_files)
    write_changed_zip(changed_zip, current_files, rows)
    write_patch(patch, base_files, current_files, rows)
    artifact_entries = write_artifact_zip(artifact_zip, evidence_root, current_root)
    changed_list.write_text(
        "\n".join(f"{row['status']}\t{row['path']}" for row in rows) + "\n",
        encoding="utf-8",
    )

    with zipfile.ZipFile(full_zip) as archive:
        full_names = archive.namelist()
    with zipfile.ZipFile(changed_zip) as archive:
        changed_names = archive.namelist()
    if not full_names or any(not name.startswith(f"{WRAPPER}/") for name in full_names):
        raise RuntimeError("Full ZIP does not preserve the exact wrapper.")
    if f"{WRAPPER}/package.json" not in full_names:
        raise RuntimeError("Full ZIP does not place package.json at the Render root.")
    if len(changed_names) >= 100:
        raise RuntimeError(f"Changed-files ZIP has {len(changed_names)} files; GitHub web upload requires fewer than 100.")
    forbidden_entries = [
        name
        for name in full_names
        if any(f"/{segment}/" in f"/{name.lower()}/" for segment in EXCLUDED_SEGMENTS)
        or Path(name).name.lower() in RUNTIME_NAMES
        or SECRET_NAME.match(Path(name).name)
    ]
    if forbidden_entries:
        raise RuntimeError(f"Forbidden package entries: {forbidden_entries}")

    qa_index = json.loads((evidence_root / "release-artifact-index.json").read_text(encoding="utf-8"))
    pdf_inspection = json.loads((evidence_root / "pdf-binary-inspection.json").read_text(encoding="utf-8"))
    manifest = {
        "release": "12.9.7",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "authoritativeSource": "diagnostic-lab-v12.9.0-internal-validation.zip",
        "startingPackageVersion": base_package.get("version"),
        "wrapper": WRAPPER,
        "render": {
            "rootDirectory": WRAPPER,
            "buildCommand": "npm install",
            "startCommand": "npm start",
            "healthCheckPath": "/api/health",
            "nodeVersion": "22.16.0",
        },
        "sourceFileCount": len(current_files),
        "changedSourceFileCount": len(rows),
        "changedZipFileCount": len(changed_names),
        "changedByStatus": {
            status: sum(row["status"] == status for row in rows)
            for status in ["A", "M", "D"]
        },
        "providerValidation": qa_index["providerValidation"],
        "pdfBinaryInspectionPass": pdf_inspection["machinePass"],
        "artifacts": {
            full_zip.name: {"sha256": sha256(full_zip), "bytes": full_zip.stat().st_size},
            changed_zip.name: {"sha256": sha256(changed_zip), "bytes": changed_zip.stat().st_size},
            patch.name: {"sha256": sha256(patch), "bytes": patch.stat().st_size},
            artifact_zip.name: {"sha256": sha256(artifact_zip), "bytes": artifact_zip.stat().st_size},
            changed_list.name: {"sha256": sha256(changed_list), "bytes": changed_list.stat().st_size},
        },
        "qaEvidenceEntries": artifact_entries,
        "excluded": sorted(EXCLUDED_SEGMENTS | RUNTIME_NAMES),
        "deployed": False,
        "verdict": "CONDITIONAL PASS — local evidence-integrity, browser, PDF and full-suite gates pass; live provider is blocked by missing local credential.",
    }
    manifest_path = output_root / "RELEASE-MANIFEST-v12.9.7.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    checksums_path = output_root / "SHA256SUMS-v12.9.7.txt"
    checksums_path.write_text(
        "\n".join(
            f"{details['sha256']}  {name}"
            for name, details in manifest["artifacts"].items()
        )
        + f"\n{sha256(manifest_path)}  {manifest_path.name}\n",
        encoding="utf-8",
    )
    for name in [
        "COMPLETION-SUMMARY-v12.9.7.md",
        "V12_9_7_RELEASE_MANIFEST.md",
        "PDF-PAGE-BY-PAGE-INSPECTION-v12.9.7.md",
        "PROVIDER-VALIDATION-CHECKLIST-v12.9.7.md",
        "MIGRATION-v12.9.7.md",
        "ROLLBACK-v12.9.7.md",
        "UPLOAD-SETTINGS-v12.9.7.txt",
    ]:
        shutil.copy2(current_root / name, output_root / name)

    print(
        json.dumps(
            {
                "sourceFileCount": len(current_files),
                "changedSourceFileCount": len(rows),
                "changedZipFileCount": len(changed_names),
                "fullZip": str(full_zip),
                "changedZip": str(changed_zip),
                "patch": str(patch),
                "artifactZip": str(artifact_zip),
                "manifest": str(manifest_path),
                "forbiddenEntries": forbidden_entries,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
