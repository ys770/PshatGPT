"""Structure of the Talmud Bavli — tractates, daf counts, seder groupings.

Daf counts are the NUMBER of the last daf in the Vilna edition (every masechta
starts at 2a). Each daf has amud a and amud b, except the very last one which
typically has only amud a. Exceptions noted per tractate where needed.
"""
from __future__ import annotations

# Each tractate: (english_name, hebrew_name, last_daf_number, last_amud)
# "last_amud" is "a" or "b" — tells us where the tractate stops.
TRACTATES_BY_SEDER: dict[str, list[tuple[str, str, int, str]]] = {
    "Zeraim": [
        ("Berakhot", "ברכות", 64, "a"),
    ],
    "Moed": [
        ("Shabbat", "שבת", 157, "b"),
        ("Eruvin", "עירובין", 105, "a"),
        ("Pesachim", "פסחים", 121, "b"),
        ("Yoma", "יומא", 88, "a"),
        ("Sukkah", "סוכה", 56, "b"),
        ("Beitzah", "ביצה", 40, "b"),
        ("Rosh Hashanah", "ראש השנה", 35, "a"),
        ("Taanit", "תענית", 31, "a"),
        ("Megillah", "מגילה", 32, "a"),
        ("Moed Katan", "מועד קטן", 29, "a"),
        ("Chagigah", "חגיגה", 27, "a"),
    ],
    "Nashim": [
        ("Yevamot", "יבמות", 122, "b"),
        ("Ketubot", "כתובות", 112, "b"),
        ("Nedarim", "נדרים", 91, "b"),
        ("Nazir", "נזיר", 66, "b"),
        ("Sotah", "סוטה", 49, "b"),
        ("Gittin", "גיטין", 90, "b"),
        ("Kiddushin", "קידושין", 82, "b"),
    ],
    "Nezikin": [
        ("Bava Kamma", "בבא קמא", 119, "b"),
        ("Bava Metzia", "בבא מציעא", 119, "a"),
        ("Bava Batra", "בבא בתרא", 176, "b"),
        ("Sanhedrin", "סנהדרין", 113, "b"),
        ("Makkot", "מכות", 24, "b"),
        ("Shevuot", "שבועות", 49, "b"),
        ("Avodah Zarah", "עבודה זרה", 76, "b"),
        ("Horayot", "הוריות", 14, "a"),
    ],
    "Kodashim": [
        ("Zevachim", "זבחים", 120, "b"),
        ("Menachot", "מנחות", 110, "a"),
        ("Chullin", "חולין", 142, "a"),
        ("Bekhorot", "בכורות", 61, "a"),
        ("Arakhin", "ערכין", 34, "a"),
        ("Temurah", "תמורה", 34, "a"),
        ("Keritot", "כריתות", 28, "b"),
        ("Meilah", "מעילה", 22, "a"),
        ("Tamid", "תמיד", 33, "b"),
        ("Niddah", "נדה", 73, "a"),
    ],
}


def all_tractates() -> list[dict]:
    """Flat list of all tractates with seder + structure info."""
    out = []
    for seder, tractates in TRACTATES_BY_SEDER.items():
        for eng, heb, last_daf, last_amud in tractates:
            out.append(
                {
                    "name": eng,
                    "hebrew": heb,
                    "seder": seder,
                    "last_daf": last_daf,
                    "last_amud": last_amud,
                    "meforshim": meforshim_for_tractate(eng),
                }
            )
    return out


def dafim_for(tractate: str) -> list[str]:
    """Generate all valid daf refs for a tractate, e.g. ['2a', '2b', '3a', ...]."""
    for seder_tractates in TRACTATES_BY_SEDER.values():
        for name, _, last_daf, last_amud in seder_tractates:
            if name == tractate:
                refs: list[str] = []
                for d in range(2, last_daf + 1):
                    refs.append(f"{d}a")
                    if d < last_daf or last_amud == "b":
                        refs.append(f"{d}b")
                return refs
    raise ValueError(f"unknown tractate: {tractate}")


# Per-tractate mefaresh mapping. Default is Rashi+Tosafot; override where the
# "Rashi" role is played by someone else (classical ikkar mefaresh on a daf).
_MEFORSHIM_OVERRIDES: dict[str, list[str]] = {
    # Bava Batra: Rashi only goes through ~29a; Rashbam takes over.
    # Sefaria indexes Rashbam as its own commentary, so we pull both and let
    # whichever has content for the daf show up.
    "Bava Batra": ["Rashbam", "Rashi", "Tosafot"],
    # Nedarim: Ran is the primary commentary printed; Rashi exists but is
    # less commonly used. Include both plus Tosafot.
    "Nedarim": ["Ran on Nedarim", "Rashi", "Tosafot"],
    # Makkot: Rashi stops around 19b; Ran/Rashba completes it.
    "Makkot": ["Rashi", "Tosafot"],
    # Taanit: printed version often uses Rashi's grandson (Rashi still exists).
    "Taanit": ["Rashi", "Tosafot"],
    # Meilah: Rashi for part, Tosafot haRosh / other for rest.
    "Meilah": ["Rashi", "Tosafot"],
    # Tamid, Middot, Keritot: various — keep defaults, refine later.
}


def meforshim_for_tractate(tractate: str) -> list[str]:
    """Return the mefaresh names to fetch for a given tractate."""
    return _MEFORSHIM_OVERRIDES.get(tractate, ["Rashi", "Tosafot"])
