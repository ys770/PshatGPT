"""Fetch the Nesikha d'Rabbi Abba sugya and print it."""
from __future__ import annotations

from gemara.fetcher import fetch_sugya


def main() -> None:
    sugya = fetch_sugya(
        base_ref="Bava Batra 33b",
        segment_range=(4, 8),  # land-chazaka case through the naskha story
        title="Nesikha d'Rabbi Abba",
    )
    print(f"=== {sugya.title} ({sugya.base_ref}) ===\n")
    for seg in sugya.segments:
        print(f"--- [{seg.index}] {seg.ref} ---")
        print("HE:", seg.hebrew[:200], "..." if len(seg.hebrew) > 200 else "")
        print("EN:", seg.english[:200], "..." if len(seg.english) > 200 else "")
        print()


if __name__ == "__main__":
    main()
