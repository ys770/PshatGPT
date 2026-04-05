from __future__ import annotations

import re

import httpx

from gemara.meforshim import fetch_meforshim
from gemara.models import Segment, Sugya

SEFARIA_API = "https://www.sefaria.org/api/v3/texts"

# Strip Sefaria's <b>...</b> emphasis tags from English translations.
_TAG_RE = re.compile(r"<[^>]+>")


def _clean(text: str) -> str:
    return _TAG_RE.sub("", text).strip()


def fetch_segments(base_ref: str) -> list[Segment]:
    """Fetch all segments of a daf/chapter ref from Sefaria.

    base_ref is a Sefaria reference like "Bava Batra 33b" — spaces become
    underscores in the URL. We request both the Hebrew (William Davidson
    vocalized Aramaic) and English (William Davidson English) versions in
    one round-trip using v3's multi-version query syntax.
    """
    url_ref = base_ref.replace(" ", "_")
    params = [("version", "hebrew"), ("version", "english")]
    r = httpx.get(f"{SEFARIA_API}/{url_ref}", params=params, timeout=30)
    r.raise_for_status()
    data = r.json()

    hebrew_text: list[str] = []
    english_text: list[str] = []
    for v in data.get("versions", []):
        lang = v.get("language")
        if lang == "he":
            hebrew_text = v.get("text", [])
        elif lang == "en":
            english_text = v.get("text", [])

    segments: list[Segment] = []
    for i, (he, en) in enumerate(zip(hebrew_text, english_text), start=1):
        segments.append(
            Segment(
                ref=f"{base_ref}:{i}",
                index=i,
                hebrew=he.strip(),
                english=_clean(en),
            )
        )
    return segments


def fetch_sugya(
    base_ref: str,
    segment_range: tuple[int, int],
    title: str,
    commentators: list[str] | None = None,
) -> Sugya:
    """Fetch a specific slice of segments as one Sugya, with meforshim attached."""
    all_segments = fetch_segments(base_ref)
    lo, hi = segment_range
    chosen = [s for s in all_segments if lo <= s.index <= hi]
    if commentators:
        meforshim = fetch_meforshim(base_ref, commentators)
        for seg in chosen:
            seg.commentaries = meforshim.get(seg.index, [])
    return Sugya(title=title, base_ref=base_ref, segments=chosen)


def fetch_daf(base_ref: str, commentators: list[str] | None = None) -> Sugya:
    """Fetch a whole daf (not a sugya slice) with meforshim attached.

    Returns a Sugya object for compatibility, with title=base_ref and all
    segments of the daf.
    """
    segments = fetch_segments(base_ref)
    if commentators:
        meforshim = fetch_meforshim(base_ref, commentators)
        for seg in segments:
            seg.commentaries = meforshim.get(seg.index, [])
    return Sugya(title=base_ref, base_ref=base_ref, segments=segments)
