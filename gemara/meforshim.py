"""Fetch meforshim (commentaries) for a daf from Sefaria.

Sefaria stores each mefaresh as its own text, indexed by gemara segment.
Structure for e.g. "Rashbam on Bava Batra 33b":
    text[segment_idx - 1][sub_comment_idx - 1] = "<hebrew dibur hamatchil + explanation>"

Some segments have 0 comments, others have 1–6. We fetch the whole daf in
one request per mefaresh, then distribute comments back to segments.
"""
from __future__ import annotations

import re

import httpx

from gemara.models import Commentary

SEFARIA_API = "https://www.sefaria.org/api/v3/texts"
_TAG_RE = re.compile(r"<[^>]+>")


def _clean(text: str) -> str:
    return _TAG_RE.sub("", text).strip()


# Display metadata per mefaresh.
COMMENTATOR_INFO = {
    "Rashbam": {"hebrew": "רשב״ם", "display": "Rashbam"},
    "Rashi": {"hebrew": "רש״י", "display": "Rashi"},
    "Tosafot": {"hebrew": "תוספות", "display": "Tosafot"},
}


def _fetch_commentator_daf(
    commentator: str, tractate: str, daf: str
) -> list[list[str]]:
    """Return nested list: [segment_idx][sub_idx] = hebrew text.

    Empty segments become empty inner lists so indexing stays aligned.
    """
    ref = f"{commentator} on {tractate} {daf}".replace(" ", "_")
    r = httpx.get(f"{SEFARIA_API}/{ref}", params=[("version", "hebrew")], timeout=30)
    r.raise_for_status()
    data = r.json()
    versions = data.get("versions", [])
    if not versions:
        return []
    text = versions[0].get("text", [])
    # Normalize to list-of-lists (some segments may come back as bare strings).
    out: list[list[str]] = []
    for item in text:
        if isinstance(item, list):
            out.append([s for s in item if s])
        elif isinstance(item, str) and item:
            out.append([item])
        else:
            out.append([])
    return out


def fetch_meforshim(
    base_ref: str, commentators: list[str]
) -> dict[int, list[Commentary]]:
    """Fetch all requested meforshim on a daf.

    base_ref is the gemara ref like "Bava Batra 33b". Returns a mapping
    from gemara segment index (1-based) to a list of Commentary objects
    across all requested commentators.
    """
    # Split "Bava Batra 33b" → ("Bava Batra", "33b").
    parts = base_ref.rsplit(" ", 1)
    if len(parts) != 2:
        raise ValueError(f"could not parse tractate/daf from {base_ref!r}")
    tractate, daf = parts

    result: dict[int, list[Commentary]] = {}
    for name in commentators:
        info = COMMENTATOR_INFO.get(name, {"hebrew": name, "display": name})
        nested = _fetch_commentator_daf(name, tractate, daf)
        for seg_idx_zero, comments in enumerate(nested):
            seg_idx = seg_idx_zero + 1
            bucket = result.setdefault(seg_idx, [])
            for sub_idx_zero, text in enumerate(comments):
                bucket.append(
                    Commentary(
                        commentator=info["display"],
                        hebrew_name=info["hebrew"],
                        ref=f"{name} on {base_ref}:{seg_idx}:{sub_idx_zero + 1}",
                        sub_index=sub_idx_zero + 1,
                        hebrew=_clean(text),
                    )
                )
    return result
