from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium
from PIL import Image, ImageDraw
from pypdf import PdfReader


SECTION_HEADINGS = [
    "Executive Summary",
    "Position and Route",
    "IELTS Criteria Breakdown",
    "Kru Pom Framework Breakdown",
    "Top Evidence-Based Issues",
    "Paragraph Coverage Summary",
    "Detailed Paragraph Feedback",
    "Language Pattern Summary",
    "Personalized 7-Day Repair Plan",
    "Progress Summary",
    "Disclaimer",
]

INTERNAL_PATTERNS = [
    re.compile(pattern, re.I)
    for pattern in [
        r"\bpriority-[a-z0-9-]+\b",
        r"\bsubmissionGroupId\b",
        r"\breportVersionId\b",
        r"\bparentReportId\b",
        r"\bnormalizedResponseFingerprint\b",
        r"\blegacy-[a-f0-9]+\b",
        r"\bcanonical issue id\b",
        r"\bissue-[a-f0-9]{8}\b",
    ]
]


def unicode_issues(text: str) -> list[dict]:
    issues: list[dict] = []
    for index, char in enumerate(text):
        point = ord(char)
        forbidden = (
            0xD800 <= point <= 0xDFFF
            or 0xFDD0 <= point <= 0xFDEF
            or point & 0xFFFF in (0xFFFE, 0xFFFF)
            or point in (0x00AD, 0x200B, 0x2060, 0xFFFD)
        )
        if forbidden:
            issues.append({"index": index, "codePoint": f"U+{point:04X}"})
    return issues


def render_pages(pdf_path: Path, target_dir: Path) -> list[Path]:
    target_dir.mkdir(parents=True, exist_ok=True)
    document = pdfium.PdfDocument(str(pdf_path))
    paths: list[Path] = []
    for index in range(len(document)):
        page = document[index]
        image = page.render(scale=1.7).to_pil().convert("RGB")
        target = target_dir / f"page-{index + 1:02d}.png"
        image.save(target, "PNG", optimize=True)
        paths.append(target)
    return paths


def build_contact_sheets(page_paths: list[Path], target_dir: Path, label: str) -> list[Path]:
    target_dir.mkdir(parents=True, exist_ok=True)
    output: list[Path] = []
    thumb_width = 700
    margin = 24
    label_height = 44
    for group_index in range(0, len(page_paths), 4):
        group = page_paths[group_index : group_index + 4]
        thumbs: list[Image.Image] = []
        for page_path in group:
            image = Image.open(page_path).convert("RGB")
            height = round(image.height * thumb_width / image.width)
            thumbs.append(image.resize((thumb_width, height), Image.Resampling.LANCZOS))
        thumb_height = max(image.height for image in thumbs)
        canvas = Image.new(
            "RGB",
            (thumb_width * 2 + margin * 3, (thumb_height + label_height) * 2 + margin * 3),
            "white",
        )
        draw = ImageDraw.Draw(canvas)
        for offset, image in enumerate(thumbs):
            row, column = divmod(offset, 2)
            x = margin + column * (thumb_width + margin)
            y = margin + row * (thumb_height + label_height + margin)
            page_number = group_index + offset + 1
            draw.text((x, y), f"{label} — page {page_number}", fill="black")
            canvas.paste(image, (x, y + label_height))
        target = target_dir / f"{label.lower()}-contact-{group_index // 4 + 1:02d}.png"
        canvas.save(target, "PNG", optimize=True)
        output.append(target)
    return output


def inspect_pdf(pdf_path: Path, output_dir: Path, label: str) -> dict:
    reader = PdfReader(str(pdf_path))
    pypdf_pages = [(page.extract_text() or "") for page in reader.pages]
    with pdfplumber.open(pdf_path) as document:
        plumber_pages = [(page.extract_text(x_tolerance=2, y_tolerance=3) or "") for page in document.pages]

    page_dir = output_dir / "pdf-pages" / label.lower()
    contact_dir = output_dir / "pdf-contact-sheets"
    rendered_pages = render_pages(pdf_path, page_dir)
    contact_sheets = build_contact_sheets(rendered_pages, contact_dir, label)

    page_rows = []
    all_text = "\n\n".join(pypdf_pages)
    for index, (pypdf_text, plumber_text) in enumerate(zip(pypdf_pages, plumber_pages), start=1):
        compact = re.sub(r"\s+", " ", pypdf_text).strip()
        sections = [heading for heading in SECTION_HEADINGS if heading.lower() in compact.lower()]
        internal_matches = [
            pattern.pattern for pattern in INTERNAL_PATTERNS if pattern.search(pypdf_text)
        ]
        unicode_failures = unicode_issues(pypdf_text)
        expected_number = f"Page {index} of {len(pypdf_pages)}"
        page_rows.append(
            {
                "page": index,
                "sectionsPresent": sections,
                "pypdfTextCharacters": len(pypdf_text),
                "pdfplumberTextCharacters": len(plumber_text),
                "blankOrNearEmpty": len(compact) < 80,
                "numbering": expected_number,
                "numberingPresent": expected_number.lower() in compact.lower(),
                "unicodeIssues": unicode_failures,
                "internalIdPatterns": internal_matches,
                "searchableSelectableText": len(compact) >= 80 and len(plumber_text.strip()) >= 80,
                "copyPasteExtractorAgreement": (
                    len(pypdf_text.strip()) >= 80
                    and len(plumber_text.strip()) >= 80
                    and abs(len(pypdf_text) - len(plumber_text))
                    <= max(120, round(max(len(pypdf_text), len(plumber_text)) * 0.18))
                ),
                "renderedPng": str(rendered_pages[index - 1]),
            }
        )

    extracted_path = output_dir / f"{label}-extracted-pdf-text.txt"
    extracted_path.write_text(all_text, encoding="utf-8")
    internal_document_matches = [
        pattern.pattern for pattern in INTERNAL_PATTERNS if pattern.search(all_text)
    ]
    result = {
        "label": label,
        "pdf": str(pdf_path),
        "sha256": hashlib.sha256(pdf_path.read_bytes()).hexdigest(),
        "fileBytes": pdf_path.stat().st_size,
        "pageCount": len(pypdf_pages),
        "pypdfPageCount": len(pypdf_pages),
        "pdfplumberPageCount": len(plumber_pages),
        "textCharacters": len(all_text),
        "extractedText": str(extracted_path),
        "internalIdPatterns": internal_document_matches,
        "unicodeIssues": unicode_issues(all_text),
        "replacementGlyphCount": all_text.count("\uFFFD"),
        "pages": page_rows,
        "renderedPages": [str(path) for path in rendered_pages],
        "contactSheets": [str(path) for path in contact_sheets],
        "machinePass": (
            len(pypdf_pages) == len(plumber_pages)
            and not internal_document_matches
            and not unicode_issues(all_text)
            and all(
                not row["blankOrNearEmpty"]
                and row["numberingPresent"]
                and row["searchableSelectableText"]
                and row["copyPasteExtractorAgreement"]
                for row in page_rows
            )
        ),
    }
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output_dir = Path(args.output).resolve()
    candidates = [
        ("Eva", output_dir / "Eva-final-report.pdf"),
        ("Evin", output_dir / "Evin-final-report.pdf"),
    ]
    available = [(label, pdf_path) for label, pdf_path in candidates if pdf_path.exists()]
    if not available:
        raise FileNotFoundError("No acceptance PDF was found in the output directory.")
    results = [
        inspect_pdf(pdf_path, output_dir, label)
        for label, pdf_path in available
    ]
    payload = {
        "inspectionMethod": "pypdf + pdfplumber text extraction; pypdfium2 page rasterisation",
        "results": results,
        "machinePass": all(item["machinePass"] for item in results),
    }
    target = output_dir / "pdf-binary-inspection.json"
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "machinePass": payload["machinePass"],
                "results": [
                    {
                        "label": item["label"],
                        "pageCount": item["pageCount"],
                        "textCharacters": item["textCharacters"],
                        "internalIdPatterns": item["internalIdPatterns"],
                        "unicodeIssues": item["unicodeIssues"],
                        "machinePass": item["machinePass"],
                        "contactSheets": item["contactSheets"],
                    }
                    for item in results
                ],
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
