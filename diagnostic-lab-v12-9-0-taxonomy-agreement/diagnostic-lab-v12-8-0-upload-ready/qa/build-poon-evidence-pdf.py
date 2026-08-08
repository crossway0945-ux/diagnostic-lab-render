from __future__ import annotations

import argparse
import html
import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


INK = colors.HexColor("#173f39")
GREEN = colors.HexColor("#256b5a")
GOLD = colors.HexColor("#b8863b")
PAPER = colors.HexColor("#fbf8f1")
CARD = colors.HexColor("#ffffff")
MUTED = colors.HexColor("#66645f")
LINE = colors.HexColor("#ddd2bf")
WARN = colors.HexColor("#9f4d42")


def register_fonts() -> tuple[str, str]:
    regular_candidates = [Path(r"C:\Windows\Fonts\segoeui.ttf"), Path(r"C:\Windows\Fonts\arial.ttf")]
    bold_candidates = [Path(r"C:\Windows\Fonts\segoeuib.ttf"), Path(r"C:\Windows\Fonts\arialbd.ttf")]
    regular = next((item for item in regular_candidates if item.exists()), None)
    bold = next((item for item in bold_candidates if item.exists()), None)
    if regular:
        pdfmetrics.registerFont(TTFont("ClinicRegular", str(regular)))
    if bold:
        pdfmetrics.registerFont(TTFont("ClinicBold", str(bold)))
    return ("ClinicRegular" if regular else "Helvetica", "ClinicBold" if bold else "Helvetica-Bold")


REGULAR, BOLD = register_fonts()
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="ClinicTitle", fontName=BOLD, fontSize=22, leading=27, textColor=INK, alignment=TA_CENTER, spaceAfter=10))
styles.add(ParagraphStyle(name="ClinicSubtitle", fontName=REGULAR, fontSize=10, leading=14, textColor=MUTED, alignment=TA_CENTER, spaceAfter=12))
styles.add(ParagraphStyle(name="ClinicH1", fontName=BOLD, fontSize=16, leading=20, textColor=INK, spaceAfter=8))
styles.add(ParagraphStyle(name="ClinicH2", fontName=BOLD, fontSize=11, leading=14, textColor=GREEN, spaceBefore=4, spaceAfter=4))
styles.add(ParagraphStyle(name="ClinicBody", fontName=REGULAR, fontSize=8.7, leading=12.2, textColor=colors.HexColor("#292824"), spaceAfter=5))
styles.add(ParagraphStyle(name="ClinicSmall", fontName=REGULAR, fontSize=7.7, leading=10.5, textColor=MUTED, spaceAfter=3))
styles.add(ParagraphStyle(name="ClinicLabel", fontName=BOLD, fontSize=7.7, leading=10, textColor=INK, spaceAfter=2))
styles.add(ParagraphStyle(name="ClinicStatus", fontName=BOLD, fontSize=8.5, leading=11, textColor=WARN, spaceAfter=4))


def safe(value: object) -> str:
    return html.escape(str(value or "")).replace("\n", "<br/>")


def para(value: object, style: str = "ClinicBody") -> Paragraph:
    return Paragraph(safe(value), styles[style])


def rich(label: str, value: object, style: str = "ClinicBody") -> Paragraph:
    return Paragraph(f"<b>{safe(label)}</b> {safe(value)}", styles[style])


def card(rows: list, padding: int = 7) -> Table:
    table = Table([[rows]], colWidths=[A4[0] - 40 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), padding),
        ("RIGHTPADDING", (0, 0), (-1, -1), padding),
        ("TOPPADDING", (0, 0), (-1, -1), padding),
        ("BOTTOMPADDING", (0, 0), (-1, -1), padding),
    ]))
    return table


def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canvas.setStrokeColor(LINE)
    canvas.line(20 * mm, A4[1] - 16 * mm, A4[0] - 20 * mm, A4[1] - 16 * mm)
    canvas.setFont(BOLD, 7.5)
    canvas.setFillColor(GOLD)
    canvas.drawString(20 * mm, A4[1] - 12 * mm, "PREMIUM IELTS WRITING CLINIC")
    canvas.setFont(REGULAR, 7.2)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(A4[0] - 20 * mm, 10 * mm, f"Poon Poon · Page {doc.page} of 14")
    canvas.restoreState()


def heading(title: str, subtitle: str = "") -> list:
    rows = [Paragraph(safe(title), styles["ClinicH1"]), HRFlowable(width="100%", thickness=0.7, color=LINE), Spacer(1, 5)]
    if subtitle:
        rows.append(para(subtitle, "ClinicSmall"))
    return rows


def issue_card(item: dict, number: int) -> Table:
    rows = [
        Paragraph(f"<b>{number}. {safe(item.get('issueCategory') or item.get('title'))}</b> · {safe(item.get('severity'))}", styles["ClinicH2"]),
        rich("Location:", item.get("paragraphLocation"), "ClinicSmall"),
        rich("Exact evidence:", item.get("exactSentence")),
        rich("Target:", item.get("targetSpan"), "ClinicSmall"),
        rich("Diagnosis:", item.get("kruPomDiagnosis") or item.get("whyItLimitsBand")),
        rich("Student Action:", item.get("studentAction")),
        rich("Revision state:", item.get("revisionType"), "ClinicSmall"),
    ]
    revision = item.get("targetedRevision")
    if revision:
        rows.append(rich("Targeted revision:", revision, "ClinicSmall"))
    return card(rows)


def build_pdf(view: dict, qa: dict, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(
        str(target), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=20 * mm, bottomMargin=17 * mm,
        title="IELTS Writing 7+ Diagnostic Lab - Poon Poon",
        author="Kru Pom IELTS",
        subject="Qualified Opinion route stop-ship acceptance report",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body")
    doc.addPageTemplates([PageTemplate(id="report", frames=[frame], onPage=on_page)])
    story: list = []

    meta = view.get("studentMetadata", {})
    story.extend([
        Spacer(1, 30 * mm),
        Paragraph("IELTS Writing 7+<br/>Diagnostic Lab", styles["ClinicTitle"]),
        Paragraph("Evidence-Based IELTS Writing Feedback Using IELTS Criteria + Kru Pom Writing Framework", styles["ClinicSubtitle"]),
        Spacer(1, 7 * mm),
        card([
            para(f"Student: {meta.get('studentName', 'Poon Poon')}", "ClinicH2"),
            rich("Task:", f"{meta.get('taskType')} · {meta.get('taskSubtype')}"),
            rich("Verified word count:", meta.get("wordCount")),
            rich("Estimated band range:", view.get("estimatedBandRange"), "ClinicStatus"),
        ], 12),
        Spacer(1, 8 * mm),
        para("This report is generated from the final validated canonical state for the exact Poon Poon submission.", "ClinicSmall"),
        PageBreak(),
    ])

    task_input = qa.get("taskInput", {})
    story.extend(heading("Task and exact student response", "The evidence below is preserved from the authoritative submission."))
    story.append(card([para("Task prompt", "ClinicH2"), para(task_input.get("prompt"))]))
    story.append(Spacer(1, 5))
    story.append(card([para("Student response", "ClinicH2"), para(task_input.get("studentWriting"), "ClinicSmall")]))
    story.append(PageBreak())

    story.extend(heading("Executive summary and final position"))
    summary = view.get("executiveSummary", {})
    route = view.get("positionAndRoute", {})
    story.extend([
        card([rich("Main score-limiting factor:", summary.get("mainScoreLimitingFactor")), rich("Most urgent repair:", summary.get("mostUrgentRepair"))]),
        Spacer(1, 6),
        card([
            para("Position and route", "ClinicH2"),
            rich("Position:", route.get("position")),
            rich("Confidence:", route.get("confidence")),
            rich("Route summary:", route.get("summary")),
        ]),
    ])
    story.append(PageBreak())

    story.extend(heading("IELTS criteria score breakdown"))
    for name, item in view.get("criteriaBreakdown", {}).items():
        story.append(card([
            Paragraph(f"<b>{safe(name)}</b> · {safe(item.get('range'))}", styles["ClinicH2"]),
            para(item.get("diagnosis")),
        ]))
        story.append(Spacer(1, 5))
    story.append(PageBreak())

    story.extend(heading("Kru Pom framework evidence"))
    for name, item in view.get("frameworkBreakdown", {}).items():
        story.append(card([
            Paragraph(f"<b>{safe(name)}</b> · {safe(item.get('status'))}", styles["ClinicH2"]),
            para(item.get("diagnosis"), "ClinicSmall"),
        ], 5))
        story.append(Spacer(1, 3))
    story.append(PageBreak())

    story.extend(heading("Paragraph Coverage", "Each card separates route, development, support and language."))
    for item in view.get("paragraphCoverage", []):
        dims = item.get("dimensions", {})
        story.append(card([
            Paragraph(f"<b>{safe(item.get('paragraphLabel'))}</b>", styles["ClinicH2"]),
            para(item.get("status"), "ClinicStatus"),
            para(item.get("diagnosis"), "ClinicSmall"),
            rich("Priority repair:", item.get("priorityRepair") or "No priority structural repair.", "ClinicSmall"),
            rich("Dimensions:", ", ".join(f"{key}={value}" for key, value in dims.items()), "ClinicSmall"),
        ], 6))
        story.append(Spacer(1, 4))
    story.append(PageBreak())

    story.extend(heading("Top repair priorities"))
    for index, item in enumerate(view.get("topIssues", []), 1):
        story.append(card([
            Paragraph(f"<b>{index}. {safe(item.get('title') or item.get('issueCategory'))}</b> · {safe(item.get('severity'))}", styles["ClinicH2"]),
            rich("Location:", item.get("paragraphLocation"), "ClinicSmall"),
            rich("Evidence:", item.get("exactSentence")),
            rich("Why it matters:", item.get("whyItLimitsBand") or item.get("summary")),
        ]))
        story.append(Spacer(1, 6))
    story.append(PageBreak())

    detailed = view.get("detailedFeedback", [])
    groups = [detailed[0:3], detailed[3:6], detailed[6:8], detailed[8:10]]
    issue_number = 1
    for group_index, group in enumerate(groups, 1):
        story.extend(heading(f"Detailed Feedback · Part {group_index} of {len(groups)}"))
        for item in group:
            story.append(issue_card(item, issue_number))
            story.append(Spacer(1, 5))
            issue_number += 1
        story.append(PageBreak())

    story.extend(heading("Language Pattern Summary", "Lower-priority patterns remain visible without displacing the route repair."))
    for index, item in enumerate(view.get("languagePatternSummary", []), 1):
        story.append(card([
            Paragraph(f"<b>{index}. {safe(item.get('category'))}</b>", styles["ClinicH2"]),
            rich("Location:", item.get("paragraphLocation"), "ClinicSmall"),
            rich("Target:", item.get("targetSpan"), "ClinicSmall"),
            rich("Diagnosis:", item.get("diagnosis"), "ClinicSmall"),
            rich("Action:", item.get("action"), "ClinicSmall"),
        ]))
        story.append(Spacer(1, 5))
    story.append(PageBreak())

    plan = view.get("repairPlan", [])
    for part, subset in enumerate((plan[:4], plan[4:]), 1):
        story.extend(heading(f"7-Day Repair Plan · Part {part} of 2"))
        for item in subset:
            story.append(card([
                Paragraph(f"<b>Day {safe(item.get('day'))}: {safe(item.get('title'))}</b>", styles["ClinicH2"]),
                para(item.get("task")),
            ]))
            story.append(Spacer(1, 6))
        if part == 2:
            progress = view.get("progressSummary", {})
            story.append(card([
                para("Progress summary", "ClinicH2"),
                rich("Latest range:", progress.get("latestEstimatedRange") or view.get("estimatedBandRange"), "ClinicSmall"),
                rich("Current main repair:", progress.get("currentMainRepair") or view.get("executiveSummary", {}).get("mostUrgentRepair"), "ClinicSmall"),
                rich("Repeated issue:", progress.get("repeatedIssue") or "Not assessed in this single-submission QA fixture.", "ClinicSmall"),
            ]))
            story.append(Spacer(1, 8))
            story.append(para(view.get("disclaimer"), "ClinicSmall"))
        if part == 1:
            story.append(PageBreak())

    doc.build(story)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = Path(args.output).resolve()
    view = json.loads((output / "Poon-final-student-view.json").read_text(encoding="utf-8"))
    qa = json.loads((output / "Poon-final-canonical-qa.json").read_text(encoding="utf-8"))
    target = output / "Poon-final-report.pdf"
    build_pdf(view, qa, target)
    print(json.dumps({"pdf": str(target), "bytes": target.stat().st_size}, indent=2))


if __name__ == "__main__":
    main()
