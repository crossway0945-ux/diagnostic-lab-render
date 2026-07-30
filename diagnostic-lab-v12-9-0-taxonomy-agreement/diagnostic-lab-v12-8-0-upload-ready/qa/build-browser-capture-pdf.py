from __future__ import annotations

import argparse
import json
import textwrap
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


def register_text_font() -> str:
    candidates = [
        Path(r"C:\Windows\Fonts\arial.ttf"),
        Path(r"C:\Windows\Fonts\segoeui.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            pdfmetrics.registerFont(TTFont("AcceptanceText", str(candidate)))
            return "AcceptanceText"
    return "Helvetica"


def wrapped_lines(text: str, width: int = 145) -> list[str]:
    lines: list[str] = []
    for source_line in text.splitlines():
        if not source_line:
            lines.append("")
            continue
        lines.extend(
            textwrap.wrap(
                source_line,
                width=width,
                break_long_words=False,
                break_on_hyphens=False,
                replace_whitespace=False,
                drop_whitespace=True,
            )
            or [""]
        )
    return lines


def build_pdf(output_dir: Path, label: str) -> Path:
    pages_dir = output_dir / f"{label}-final-report-pages"
    text_path = output_dir / f"{label}-final-report-browser-page-text.json"
    pages = json.loads(text_path.read_text(encoding="utf-8"))
    images = sorted(pages_dir.glob("page-*.png"))
    if len(images) != len(pages):
        raise ValueError(
            f"{label}: image/text page mismatch ({len(images)} images, {len(pages)} text pages)."
        )

    target = output_dir / f"{label}-final-report.pdf"
    page_width, page_height = A4
    font_name = register_text_font()
    document = canvas.Canvas(str(target), pagesize=A4, pageCompression=1)
    document.setTitle(f"IELTS Writing 7+ Diagnostic Report - {label}")
    document.setAuthor("Kru Pom IELTS")
    document.setSubject("Acceptance report rendered from the production Student Report Renderer")

    for image_path, page_row in zip(images, pages):
        document.drawImage(
            ImageReader(str(image_path)),
            0,
            0,
            width=page_width,
            height=page_height,
            preserveAspectRatio=False,
            mask="auto",
        )
        text_object = document.beginText(18, page_height - 18)
        text_object.setFont(font_name, 4)
        text_object.setLeading(5)
        text_object.setTextRenderMode(3)
        for line in wrapped_lines(str(page_row.get("text", ""))):
            text_object.textLine(line)
        document.drawText(text_object)
        document.showPage()

    document.save()
    return target


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--label", default="Eva")
    args = parser.parse_args()
    output_dir = Path(args.output).resolve()
    target = build_pdf(output_dir, args.label)
    print(json.dumps({"pdf": str(target), "bytes": target.stat().st_size}, indent=2))


if __name__ == "__main__":
    main()
