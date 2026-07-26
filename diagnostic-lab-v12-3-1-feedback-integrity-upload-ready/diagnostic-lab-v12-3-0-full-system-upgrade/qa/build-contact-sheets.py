from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent / "rendered-pages"


def build_sheet(language: str, start: int, end: int, filename: str) -> None:
    files = sorted(
        (ROOT / language).glob("page-*.png"),
        key=lambda file: int(file.stem.rsplit("-", 1)[-1]),
    )[start - 1 : end]
    thumb_width = 260
    columns = 4
    label_height = 28
    margin = 12
    thumbnails = []
    for page_number, file in enumerate(files, start=start):
        image = Image.open(file).convert("RGB")
        ratio = thumb_width / image.width
        thumbnail = image.resize((thumb_width, round(image.height * ratio)))
        thumbnails.append((page_number, thumbnail))
    row_height = max(image.height for _, image in thumbnails) + label_height
    rows = (len(thumbnails) + columns - 1) // columns
    sheet = Image.new(
        "RGB",
        (margin + columns * (thumb_width + margin), margin + rows * (row_height + margin)),
        "white",
    )
    draw = ImageDraw.Draw(sheet)
    for index, (page_number, image) in enumerate(thumbnails):
        column = index % columns
        row = index // columns
        x = margin + column * (thumb_width + margin)
        y = margin + row * (row_height + margin)
        draw.text((x, y), f"Page {page_number}", fill="black")
        sheet.paste(image, (x, y + label_height))
    sheet.save(ROOT / filename, quality=92)


build_sheet("thai", 1, 7, "thai-pages-01-07.jpg")
build_sheet("thai", 8, 14, "thai-pages-08-14.jpg")
build_sheet("english", 1, 6, "english-pages-01-06.jpg")
build_sheet("english", 7, 9, "english-pages-07-09.jpg")
