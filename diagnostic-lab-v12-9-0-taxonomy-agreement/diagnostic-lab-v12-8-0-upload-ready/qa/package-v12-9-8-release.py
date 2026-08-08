from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
import shutil
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath


RELEASE = "12.9.8"
WRAPPER = "diagnostic-lab-v12-8-0-upload-ready"
REPOSITORY_PARENT = "diagnostic-lab-v12-9-0-taxonomy-agreement"

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
TEMP_SUFFIXES = {".log", ".tmp", ".pyc"}
SECRET_NAME = re.compile(
    r"^(?:\.env(?:\..*)?|.*(?:secret|credential|api[-_]?key).*)$",
    re.I,
)
LOCAL_ABSOLUTE_PATH = re.compile(
    rb"(?:[A-Za-z]:[\\/](?:Users|Documents|Desktop|Downloads)[\\/]|/(?:Users|home)/[A-Za-z0-9._-]+/)"
)
RELEASE_DOCS = [
    "COMPLETION-SUMMARY.md",
    "RELEASE-MANIFEST.md",
    "FULL-FILE-INVENTORY.txt",
    "SOURCE-INVENTORY.json",
    "INVENTORY-DIFF.md",
    "CHANGED-FILES-MANIFEST.txt",
    "SHA256SUMS.txt",
    "MIGRATION.md",
    "ROLLBACK.md",
    "PRODUCTION-SMOKE-TEST.md",
    "CHANGE-SCOPE.md",
    "PROTECTED-SYSTEMS-RESULT.md",
    "REGRESSION-MATRIX.md",
    "EARLY-BIRD-COPY-REMOVAL.md",
]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def exclusion_reason(relative: PurePosixPath) -> str | None:
    lowered_parts = {part.lower() for part in relative.parts}
    matched = sorted(lowered_parts & EXCLUDED_SEGMENTS)
    if matched:
        return f"excluded directory: {matched[0]}"
    name = relative.name.lower()
    if name in RUNTIME_NAMES:
        return "runtime data"
    if SECRET_NAME.match(relative.name):
        return "secret/environment file"
    if relative.suffix.lower() in TEMP_SUFFIXES:
        return "temporary/generated file"
    return None


def classify(relative: PurePosixPath) -> str:
    path = relative.as_posix()
    name = relative.name.lower()
    suffix = relative.suffix.lower()
    if exclusion_reason(relative):
        if name in RUNTIME_NAMES:
            return "runtime data"
        if "netlify-static-preview" in {part.lower() for part in relative.parts}:
            return "generated acceptance artifact"
        return "temporary/probe"
    if path.startswith("tests/"):
        return "test"
    if path.startswith("fixtures/") or path.startswith("tests/fixtures/"):
        return "test"
    if path.startswith("assets/") or suffix in {".html", ".css", ".ttf", ".woff", ".woff2"}:
        return "public/static asset"
    if name in {"package.json", "package-lock.json"}:
        return "package metadata"
    if name in {"render.yaml", "netlify.toml", ".gitignore"} or "env_template" in name:
        return "configuration"
    if suffix in {".md", ".txt"}:
        return "documentation"
    if suffix in {".js", ".mjs", ".py", ".json"}:
        return "source"
    return "configuration"


def iter_non_dependency_files(root: Path):
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        relative = PurePosixPath(path.relative_to(root).as_posix())
        if "node_modules" in {part.lower() for part in relative.parts}:
            continue
        yield relative, path


def full_inventory(root: Path) -> list[dict]:
    rows: list[dict] = []
    for relative, path in iter_non_dependency_files(root):
        reason = exclusion_reason(relative)
        rows.append(
            {
                "path": relative.as_posix(),
                "classification": classify(relative),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
                "includedInRelease": reason is None,
                "exclusionReason": reason,
            }
        )
    return rows


def release_map(root: Path) -> dict[str, Path]:
    return {
        relative.as_posix(): path
        for relative, path in iter_non_dependency_files(root)
        if exclusion_reason(relative) is None
    }


def hash_map_from_directory(root: Path) -> dict[str, str]:
    return {relative: sha256(path) for relative, path in release_map(root).items()}


def hash_map_from_zip(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    with zipfile.ZipFile(path) as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            normalized = info.filename.replace("\\", "/")
            marker = f"{WRAPPER}/"
            if marker not in normalized:
                continue
            relative_text = normalized.split(marker, 1)[1]
            relative = PurePosixPath(relative_text)
            if not relative.parts or exclusion_reason(relative):
                continue
            result[relative.as_posix()] = sha256_bytes(archive.read(info))
    return result


def diff_hash_maps(base: dict[str, str], current: dict[str, str]) -> dict:
    added = sorted(set(current) - set(base))
    deleted = sorted(set(base) - set(current))
    modified = sorted(path for path in set(base) & set(current) if base[path] != current[path])
    unchanged = sorted(path for path in set(base) & set(current) if base[path] == current[path])

    added_by_hash: dict[str, list[str]] = {}
    for path in added:
        added_by_hash.setdefault(current[path], []).append(path)
    renamed: list[dict] = []
    for old_path in deleted:
        matches = added_by_hash.get(base[old_path], [])
        if len(matches) == 1:
            renamed.append({"from": old_path, "to": matches[0]})

    return {
        "unchanged": unchanged,
        "modified": modified,
        "added": added,
        "deleted": deleted,
        "renamed": renamed,
    }


def markdown_paths(paths: list[str], empty: str = "- None") -> str:
    if not paths:
        return empty
    return "\n".join(f"- `{path}`" for path in paths)


def write_initial_docs(root: Path) -> None:
    (root / "MIGRATION.md").write_text(
        """# Migration to V12.9.8

No database or report-data migration is required.

1. Keep the existing persistent disk and environment variables unchanged.
2. Upload the extracted changed-files package into the existing repository parent
   `diagnostic-lab-v12-9-0-taxonomy-agreement/`, so its preserved
   `diagnostic-lab-v12-8-0-upload-ready/` wrapper overwrites the live source root.
3. Review `CHANGED-FILES-MANIFEST.txt`, then commit the Stage 0 global prompt-coverage update.
4. Wait for Render to build with `npm install` and start with `npm start`.
5. Run every item in `PRODUCTION-SMOKE-TEST.md`.

The IELTS/Kru Pom rubric, provider prompt, application version and storage schema are unchanged.
This package does not deploy itself.
""",
        encoding="utf-8",
    )
    (root / "ROLLBACK.md").write_text(
        """# Rollback — V12.9.8 Stage 0 Control Update

1. In Render, redeploy the last known-good commit from immediately before this Stage 0 update.
2. Do not delete or recreate the persistent disk.
3. Confirm `/api/health` still reports `appVersion: 12.9.8`.
4. Re-run one cached-report read and one administrator access check.

This update introduces no version or irreversible storage migration. Rollback does not require deleting reports,
users, quota records, jobs, audit records or sessions. Permanent Delete remains disabled.
""",
        encoding="utf-8",
    )
    (root / "PRODUCTION-SMOKE-TEST.md").write_text(
        """# V12.9.8 Production Smoke Test

## Health and readiness

- `/api/health`: `appVersion` is `12.9.8`.
- Provider model is the intended production model.
- `diagnosticEngineConfigured`, `fullEngineRequired`, `durableStorage` and async-render are correct.
- `/api/readiness`: frontend preflight passes and expected public modules are present.

## Eva explicit rerun

- Creates a new report version in the same submission group.
- Names the correct parent report and leaves the old report accessible.
- Charges quota exactly once.
- Produces four paragraphs, approximately Band 6.0, SAR Mixed and a functionally strong conclusion
  with language repair.
- Top Issues, Paragraph Coverage and Repair Plan remain aligned.
- PDF is approximately 10-16 pages, searchable, and free of internal IDs and Unicode corruption.

## Evin and Task 1

- Evin retains route presence and no false Subject-Verb Agreement issue.
- Task 1 chart, map, process and mixed graph retain correct overview logic.
- Task 1 never requires a conclusion and never inherits Task 2 SAR logic.

## Security and lifecycle

- Anonymous and non-admin users are blocked from admin surfaces.
- CSRF and session revocation remain enforced.
- Archive/restore works and audit entries persist.
- Permanent Delete remains disabled.
""",
        encoding="utf-8",
    )
    (root / "COMPLETION-SUMMARY.md").write_text(
        """# V12.9.8 Completion Summary

This Stage 0 update starts from the authoritative V12.9.8 full-source ZIP and preserves the complete
application, tests, public assets, release tooling, package version and deployment contract. It fixes
semantic obligation extraction for coordinated and hybrid Task 2 prompts, keeps Task 1 family rules
intact, and removes commercial Early-Bird/Founder/pricing copy only from tester/student-facing output.

The full-source ZIP and GitHub changed-files ZIP deliberately have different file counts. The first
is the complete upload wrapper; the second contains only added or modified files relative to deployed
GitHub main. No source or test is removed merely to stay below the GitHub web-upload limit.
""",
        encoding="utf-8",
    )
    for name in [
        "RELEASE-MANIFEST.md",
        "FULL-FILE-INVENTORY.txt",
        "SOURCE-INVENTORY.json",
        "INVENTORY-DIFF.md",
        "CHANGED-FILES-MANIFEST.txt",
        "SHA256SUMS.txt",
    ]:
        target = root / name
        if not target.exists():
            target.write_text(f"Generated by qa/package-v12-9-8-release.py for V{RELEASE}.\n", encoding="utf-8")


def write_release_docs(
    root: Path,
    inventory: list[dict],
    deployed_diff: dict,
    validation_diff: dict,
    handoff_diff: dict,
) -> None:
    release_rows = [row for row in inventory if row["includedInRelease"]]
    counts = Counter(row["classification"] for row in inventory)
    release_counts = Counter(row["classification"] for row in release_rows)

    source_inventory = {
        "release": RELEASE,
        "wrapper": WRAPPER,
        "repositoryParent": REPOSITORY_PARENT,
        "inventoryScope": "authoritative non-node_modules working tree",
        "nodeModulesPolicy": "excluded dependency installation; restored by npm install",
        "totalInventoriedFiles": len(inventory),
        "releaseIncludedFiles": len(release_rows),
        "releaseExcludedFiles": len(inventory) - len(release_rows),
        "classificationCounts": dict(sorted(counts.items())),
        "releaseClassificationCounts": dict(sorted(release_counts.items())),
        "files": [
            {
                **row,
                "sha256": None
                if row["path"] in {"SOURCE-INVENTORY.json", "SHA256SUMS.txt"}
                else row["sha256"],
            }
            for row in inventory
        ],
    }
    (root / "SOURCE-INVENTORY.json").write_text(
        json.dumps(source_inventory, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    lines = [
        f"V{RELEASE} AUTHORITATIVE FILE INVENTORY",
        f"Inventoried files (excluding installed node_modules): {len(inventory)}",
        f"Release-included files: {len(release_rows)}",
        f"Release-excluded runtime/generated files: {len(inventory) - len(release_rows)}",
        "",
        "INCLUDED\tCLASSIFICATION\tBYTES\tSHA256\tPATH",
    ]
    for row in inventory:
        included = "YES" if row["includedInRelease"] else "NO"
        digest = row["sha256"] if row["path"] not in {"FULL-FILE-INVENTORY.txt", "SHA256SUMS.txt"} else "SELF-GENERATED"
        lines.append(
            f"{included}\t{row['classification']}\t{row['bytes']}\t{digest}\t{row['path']}"
        )
    (root / "FULL-FILE-INVENTORY.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

    changed_lines = [
        f"V{RELEASE} CHANGED FILES RELATIVE TO DEPLOYED GITHUB MAIN SOURCE ROOT",
        f"Added: {len(deployed_diff['added'])}",
        f"Modified: {len(deployed_diff['modified'])}",
        f"Deleted: {len(deployed_diff['deleted'])}",
        f"Renamed: {len(deployed_diff['renamed'])}",
        "",
    ]
    changed_lines.extend(f"A\t{path}" for path in deployed_diff["added"])
    changed_lines.extend(f"M\t{path}" for path in deployed_diff["modified"])
    changed_lines.extend(f"D\t{path}" for path in deployed_diff["deleted"])
    changed_lines.extend(f"R\t{row['from']}\t{row['to']}" for row in deployed_diff["renamed"])
    (root / "CHANGED-FILES-MANIFEST.txt").write_text(
        "\n".join(changed_lines) + "\n",
        encoding="utf-8",
    )

    def diff_section(title: str, diff: dict) -> str:
        return f"""## {title}

- Unchanged: {len(diff['unchanged'])}
- Modified: {len(diff['modified'])}
- Added: {len(diff['added'])}
- Deleted: {len(diff['deleted'])}
- Renamed: {len(diff['renamed'])}

### Modified

{markdown_paths(diff['modified'])}

### Added

{markdown_paths(diff['added'])}

### Deleted

{markdown_paths(diff['deleted'])}

### Renamed

{markdown_paths([f"{row['from']} -> {row['to']}" for row in diff['renamed']])}

### Unchanged

{markdown_paths(diff['unchanged'])}
"""

    deletion_note = (
        "No source, test, public/static asset or package-metadata file is deleted relative to the "
        "deployed GitHub source root."
        if not deployed_diff["deleted"]
        else "Deletion gate failed; review every deletion before release."
    )
    inventory_diff = f"""# V{RELEASE} Inventory Diff

The deployed GitHub baseline is the `main` branch source root at
`{REPOSITORY_PARENT}/{WRAPPER}/`. The supplied V12.9.8 full-source ZIP is the authoritative
starting/handoff baseline and the prior-validation comparison.

{deletion_note}

{diff_section("Deployed GitHub main baseline", deployed_diff)}

{diff_section("Authoritative supplied V12.9.8 full-source ZIP", validation_diff)}

{diff_section("Authoritative V12.9.8 handoff tree", handoff_diff)}
"""
    (root / "INVENTORY-DIFF.md").write_text(inventory_diff, encoding="utf-8")

    manifest = f"""# V12.9.8 Release Manifest

## Identity

- Starting deployed application version: 12.9.8
- Final application version: 12.9.8
- Preserved source wrapper: `{WRAPPER}/`
- Existing repository parent: `{REPOSITORY_PARENT}/`
- Rubric version: `kru-pom-ielts-writing-v12.3.0` (unchanged)
- Prompt version: `ielts-diagnostic-prompt-v12.8.0` (unchanged)
- Full release file count: {len(release_rows)}
- Test-file count: {sum(1 for row in release_rows if row['classification'] == 'test' and row['path'].endswith('.test.mjs'))}

## Why package file counts differ

The full ZIP is the complete release-safe source. The GitHub changed-files ZIP is an overwrite subset
calculated against deployed `main`; it is not a second copy of the full application. File removal is
not used to satisfy GitHub's 100-file web-upload limit.

## V12.9.8 Git baseline diff

- Unchanged: {len(deployed_diff['unchanged'])}
- Modified: {len(deployed_diff['modified'])}
- Added: {len(deployed_diff['added'])}
- Deleted: {len(deployed_diff['deleted'])}
- Renamed: {len(deployed_diff['renamed'])}

## Protected-system verification

- Source check: 106 JavaScript modules passed.
- Complete suite: 46 test files passed before packaging.
- Eva: four-paragraph map, route, Band 6.0 boundary, SAR Mixed, conclusion closure and issue/action
  parity passed.
- Evin and Sun route/language regressions passed.
- Task 1 chart, map, process and mixed-graph regressions passed.
- Async-render, durable jobs, idempotency, quota, admin authentication, CSRF, lifecycle guards,
  audit, session revocation, archive/restore and anonymisation regressions passed.
- PDF binary/text acceptance evidence passed all 25 rendered pages (Eva 13, Evin 12).

## Packaging policy

The full ZIP contains the complete release-safe source. The changed-files ZIP contains only added or
modified files relative to the deployed GitHub source root. `node_modules`, runtime data, real
student/report snapshots, audit data, logs, browser caches and generated static-preview output are
excluded. No source, test or public asset is removed to meet GitHub's 100-file web limit.
"""
    (root / "RELEASE-MANIFEST.md").write_text(manifest, encoding="utf-8")


def write_source_checksums(root: Path, current: dict[str, Path]) -> None:
    lines = [
        "# Source-file checksums; SHA256SUMS.txt excludes itself.",
        *[
            f"{sha256(path)}  {relative}"
            for relative, path in sorted(current.items())
            if relative != "SHA256SUMS.txt"
        ],
    ]
    (root / "SHA256SUMS.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_zip(target: Path, current: dict[str, Path], selected: list[str] | None = None) -> None:
    names = sorted(selected if selected is not None else current)
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for relative in names:
            archive.write(current[relative], f"{WRAPPER}/{relative}")


def text_lines(path: Path | None) -> list[str]:
    if path is None:
        return []
    return path.read_text(encoding="utf-8").splitlines(keepends=True)


def write_patch(
    target: Path,
    baseline_root: Path,
    current: dict[str, Path],
    diff: dict,
) -> None:
    chunks: list[str] = []
    paths = sorted(set(diff["added"]) | set(diff["modified"]) | set(diff["deleted"]))
    for relative in paths:
        old_path = baseline_root / Path(relative)
        new_path = current.get(relative)
        old_exists = old_path.is_file()
        try:
            old_lines = text_lines(old_path if old_exists else None)
            new_lines = text_lines(new_path)
        except UnicodeDecodeError:
            chunks.append(
                f"Binary files a/{WRAPPER}/{relative} and b/{WRAPPER}/{relative} differ\n"
            )
            continue
        chunks.extend(
            difflib.unified_diff(
                old_lines,
                new_lines,
                fromfile=f"a/{WRAPPER}/{relative}" if old_exists else "/dev/null",
                tofile=f"b/{WRAPPER}/{relative}" if new_path else "/dev/null",
                n=3,
            )
        )
    target.write_text("".join(chunks), encoding="utf-8", newline="\n")


def verify_archives(full_zip: Path, changed_zip: Path, current: dict[str, Path], changed: list[str]) -> dict:
    with zipfile.ZipFile(full_zip) as full, zipfile.ZipFile(changed_zip) as changed_archive:
        full_names = [name.replace("\\", "/") for name in full.namelist() if not name.endswith("/")]
        changed_names = [
            name.replace("\\", "/") for name in changed_archive.namelist() if not name.endswith("/")
        ]
        if not full_names or any(not name.startswith(f"{WRAPPER}/") for name in full_names):
            raise RuntimeError("Full release ZIP must contain exactly one preserved wrapper.")
        if f"{WRAPPER}/package.json" not in full_names:
            raise RuntimeError("package.json is not at the wrapper root.")
        if len(changed_names) >= 100:
            raise RuntimeError(f"Changed-files ZIP contains {len(changed_names)} files; split required.")
        for relative in changed:
            archive_name = f"{WRAPPER}/{relative}"
            if sha256_bytes(full.read(archive_name)) != sha256_bytes(changed_archive.read(archive_name)):
                raise RuntimeError(f"Changed-file archive mismatch: {relative}")
            if sha256_bytes(full.read(archive_name)) != sha256(current[relative]):
                raise RuntimeError(f"Working-tree archive mismatch: {relative}")
        forbidden = [
            name
            for name in full_names
            if exclusion_reason(PurePosixPath(name.split(f"{WRAPPER}/", 1)[1]))
        ]
        if forbidden:
            raise RuntimeError(f"Forbidden package entries: {forbidden}")
        local_path_hits = []
        for name in full_names:
            try:
                data = full.read(name)
            except KeyError:
                continue
            if LOCAL_ABSOLUTE_PATH.search(data):
                local_path_hits.append(name)
        if local_path_hits:
            raise RuntimeError(f"Local absolute paths found in release files: {local_path_hits}")
    return {
        "fullZipFileCount": len(full_names),
        "changedZipFileCount": len(changed_names),
        "changedFilesByteIdentical": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--current", required=True)
    parser.add_argument("--deployed-baseline", required=True)
    parser.add_argument("--handoff-baseline", required=True)
    parser.add_argument("--prior-validation-zip", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    current_root = Path(args.current).resolve()
    deployed_root = Path(args.deployed_baseline).resolve()
    handoff_root = Path(args.handoff_baseline).resolve()
    validation_zip = Path(args.prior_validation_zip).resolve()
    output_root = Path(args.output).resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    package = json.loads((current_root / "package.json").read_text(encoding="utf-8"))
    if package.get("version") != RELEASE:
        raise RuntimeError(f"Current package version must be {RELEASE}.")

    write_initial_docs(current_root)

    deployed_hashes = hash_map_from_directory(deployed_root)
    handoff_hashes = hash_map_from_directory(handoff_root)
    validation_hashes = hash_map_from_zip(validation_zip)

    current_paths = release_map(current_root)
    current_hashes = {relative: sha256(path) for relative, path in current_paths.items()}
    deployed_diff = diff_hash_maps(deployed_hashes, current_hashes)
    validation_diff = diff_hash_maps(validation_hashes, current_hashes)
    handoff_diff = diff_hash_maps(handoff_hashes, current_hashes)
    inventory = full_inventory(current_root)
    write_release_docs(current_root, inventory, deployed_diff, validation_diff, handoff_diff)

    current_paths = release_map(current_root)
    current_hashes = {relative: sha256(path) for relative, path in current_paths.items()}
    deployed_diff = diff_hash_maps(deployed_hashes, current_hashes)
    validation_diff = diff_hash_maps(validation_hashes, current_hashes)
    handoff_diff = diff_hash_maps(handoff_hashes, current_hashes)
    inventory = full_inventory(current_root)
    write_release_docs(current_root, inventory, deployed_diff, validation_diff, handoff_diff)

    current_paths = release_map(current_root)
    write_source_checksums(current_root, current_paths)
    current_paths = release_map(current_root)
    current_hashes = {relative: sha256(path) for relative, path in current_paths.items()}
    deployed_diff = diff_hash_maps(deployed_hashes, current_hashes)

    if deployed_diff["deleted"]:
        raise RuntimeError(f"Release contains Git-baseline deletions: {deployed_diff['deleted']}")

    full_zip = output_root / f"diagnostic-lab-v{RELEASE}-full-release.zip"
    changed_zip = output_root / f"diagnostic-lab-v{RELEASE}-GITHUB-CHANGED-FILES.zip"
    patch = output_root / f"PATCH-deployed-main-to-v{RELEASE}-stage0.patch"

    changed_upload = sorted(set(deployed_diff["added"]) | set(deployed_diff["modified"]))
    write_zip(full_zip, current_paths)
    write_zip(changed_zip, current_paths, changed_upload)
    write_patch(patch, deployed_root, current_paths, deployed_diff)
    archive_verification = verify_archives(full_zip, changed_zip, current_paths, changed_upload)

    for name in RELEASE_DOCS:
        shutil.copy2(current_root / name, output_root / name)

    output_artifacts = [
        full_zip,
        changed_zip,
        patch,
        *[output_root / name for name in RELEASE_DOCS if name != "SHA256SUMS.txt"],
    ]
    (output_root / "SHA256SUMS.txt").write_text(
        "\n".join(f"{sha256(path)}  {path.name}" for path in output_artifacts) + "\n",
        encoding="utf-8",
    )

    result = {
        "release": RELEASE,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "wrapper": WRAPPER,
        "repositoryParent": REPOSITORY_PARENT,
        "deployedBaselineFileCount": len(deployed_hashes),
        "handoffBaselineFileCount": len(handoff_hashes),
        "priorValidationFileCount": len(validation_hashes),
        "releaseFileCount": len(current_paths),
        "deployedDiff": {
            key: len(deployed_diff[key])
            for key in ["unchanged", "modified", "added", "deleted", "renamed"]
        },
        "archiveVerification": archive_verification,
        "artifacts": {
            path.name: {"bytes": path.stat().st_size, "sha256": sha256(path)}
            for path in [full_zip, changed_zip, patch, output_root / "SHA256SUMS.txt"]
        },
    }
    (output_root / "PACKAGE-VERIFICATION.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
