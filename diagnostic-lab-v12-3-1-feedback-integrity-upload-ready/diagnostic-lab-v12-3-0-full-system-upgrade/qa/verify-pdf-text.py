import json
import sys
from pathlib import Path

import pdfplumber
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parent / "release-pdfs"
FORBIDDEN = (
    "submissionGroupId",
    "reportVersionId",
    "parentReportId",
    "inputFingerprint",
    "engineVersion",
    "rubricVersion",
    "validationDetails",
    "providerBodyPreview",
)
CASES = (
    ("sun-thai-v12-3-1.pdf", ("Sun V12.3.1 Final QA", "Countability", "Body Paragraph 2, Sentence 3")),
    ("yuki-english-v12-3-1.pdf", ("Yuki V12.3.1 Final QA", "Paragraph Coverage Summary", "Disclaimer")),
)

sys.stdout.reconfigure(encoding="utf-8")
results = []
for parser_name in ("pypdf", "pdfplumber/pdfminer"):
    for filename, required in CASES:
        if parser_name == "pypdf":
            reader = PdfReader(ROOT / filename)
            pages = len(reader.pages)
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
            a4_pages = all(abs(float(page.mediabox.width) - 594.96) < 0.1 and abs(float(page.mediabox.height) - 841.92) < 0.1 for page in reader.pages)
        else:
            with pdfplumber.open(ROOT / filename) as reader:
                pages = len(reader.pages)
                text = "\n".join(page.extract_text() or "" for page in reader.pages)
                a4_pages = all(abs(float(page.width) - 594.96) < 0.1 and abs(float(page.height) - 841.92) < 0.1 for page in reader.pages)
        results.append(
            {
                "file": filename,
                "parser": parser_name,
                "pages": pages,
                "characters": len(text),
                "requiredFound": {value: value in text for value in required},
                "forbiddenFound": [value for value in FORBIDDEN if value.lower() in text.lower()],
                "replacementCharacter": "\ufffd" in text,
                "nullCharacter": "\x00" in text,
                "a4Pages": a4_pages,
                "pageFootersComplete": all(f"Page {index} of {pages}" in text for index in range(1, pages + 1)),
            }
        )

print(json.dumps(results, ensure_ascii=False, indent=2))
if any(
    not all(item["requiredFound"].values())
    or item["forbiddenFound"]
    or item["replacementCharacter"]
    or item["nullCharacter"]
    or not item["a4Pages"]
    or not item["pageFootersComplete"]
    for item in results
):
    raise SystemExit(1)
