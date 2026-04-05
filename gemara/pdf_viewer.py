"""Render pages from the Shas Nehardea PDFs as images.

The downloaded folder has this structure:
    tzuras_hadaf_pdfs/<unicode-wrapped-subdir>/<vol>. <tractate(s)>.pdf

Each volume's PDF has NO table of contents, so we need a calibration mapping
to translate (tractate, daf, amud) → page_number. That lives in shas_pdf_map
below and is refined as we inspect pages.
"""
from __future__ import annotations

import os
from functools import lru_cache

import fitz  # pymupdf

# Base dir where PDFs live.
_PDF_ROOT = os.path.join(os.path.dirname(__file__), "..", "tzuras_hadaf_pdfs")


@lru_cache(maxsize=1)
def _volume_dir() -> str:
    """Return the subdirectory containing all the PDFs (folder name has unicode)."""
    for entry in os.listdir(_PDF_ROOT):
        full = os.path.join(_PDF_ROOT, entry)
        if os.path.isdir(full):
            return full
    raise FileNotFoundError(f"no subdirectory under {_PDF_ROOT}")


# Map tractate name → filename fragment. The filenames are Hebrew, so we match
# by substring. If a volume contains multiple masechtos, all share the same file
# but have different page ranges (tracked in PDF_CALIBRATION).
VOLUME_FOR_TRACTATE: dict[str, str] = {
    "Berakhot": "ברכות",
    "Shabbat": "שבת",
    "Eruvin": "עירובין",
    "Pesachim": "פסחים",
    "Yoma": "יומא",
    "Sukkah": "סוכה",
    "Beitzah": "ביצה",
    "Rosh Hashanah": "ראש",
    "Taanit": "תענית",
    "Megillah": "מגילה",
    "Moed Katan": "מועד",
    "Chagigah": "חגיגה",
    "Yevamot": "יבמות",
    "Ketubot": "כתובות",
    "Nedarim": "נדרים",
    "Nazir": "נזיר",
    "Sotah": "סוטה",
    "Gittin": "גיטין",
    "Kiddushin": "קדושין",
    "Bava Kamma": "בבא־קמא",
    "Bava Metzia": "בבא־מציעא",
    "Bava Batra": "בבא־בתרא",
    "Sanhedrin": "סנהדרין",
    "Makkot": "מכות",
    "Shevuot": "שבועות",
    "Avodah Zarah": "עבודה",
    "Horayot": "הוריות",
    "Zevachim": "זבחים",
    "Menachot": "מנחות",
    "Chullin": "חולין",
    "Niddah": "נדה",
}


# Calibration: offset and pages-per-daf for each tractate. Starts as educated
# guesses; refine empirically by opening pages and matching to known dafim.
#
# Formula: pdf_page_index (0-based) = start_page + (daf - 2) * pages_per_daf
#                                     + (0 if amud=='a' else 1)
#
# For single-masechta volumes we expect start_page to be small (front matter),
# pages_per_daf to be 2 (one image per amud) but the Nehardea edition may
# include extra commentary pages between dafim, making pages_per_daf larger.
PDF_CALIBRATION: dict[str, dict] = {
    # To be filled in after inspecting a few pages.
    # Default if tractate not listed: {"start_page": 4, "pages_per_daf": 2}
}


def find_pdf_for(tractate: str) -> str:
    """Find the PDF file containing a given tractate."""
    needle = VOLUME_FOR_TRACTATE.get(tractate)
    if not needle:
        raise ValueError(f"no PDF mapping for tractate {tractate!r}")
    dir_ = _volume_dir()
    for fname in os.listdir(dir_):
        if needle in fname and fname.endswith(".pdf"):
            return os.path.join(dir_, fname)
    raise FileNotFoundError(f"no PDF found containing {needle!r} in {dir_}")


@lru_cache(maxsize=8)
def _open_pdf(path: str) -> fitz.Document:
    return fitz.open(path)


def page_count(tractate: str) -> int:
    return _open_pdf(find_pdf_for(tractate)).page_count


def render_page(tractate: str, page_index: int, zoom: float = 1.5) -> bytes:
    """Render a single page (0-indexed) from the tractate's PDF to PNG bytes."""
    doc = _open_pdf(find_pdf_for(tractate))
    if page_index < 0 or page_index >= doc.page_count:
        raise IndexError(
            f"page {page_index} out of range (pdf has {doc.page_count} pages)"
        )
    page = doc.load_page(page_index)
    matrix = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    return pix.tobytes("png")


def daf_amud_to_page(tractate: str, daf: int, amud: str) -> int:
    """Map (tractate, daf, amud) to a 0-indexed PDF page number."""
    calib = PDF_CALIBRATION.get(tractate, {"start_page": 4, "pages_per_daf": 2})
    amud_offset = 0 if amud == "a" else 1
    return calib["start_page"] + (daf - 2) * calib["pages_per_daf"] + amud_offset
