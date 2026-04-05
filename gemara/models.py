from __future__ import annotations

from pydantic import BaseModel, Field


class Commentary(BaseModel):
    """One dibur hamatchil — a single comment from a mefaresh on a segment."""
    commentator: str  # display name, e.g. "Rashbam" / "Tosafot"
    hebrew_name: str  # e.g. "רשב״ם" / "תוספות"
    ref: str  # Sefaria ref, e.g. "Rashbam on Bava Batra 33b:4:2"
    sub_index: int  # position within the segment (1-based)
    hebrew: str
    english: str | None = None


class Segment(BaseModel):
    """A single segment of a sugya — one indexed chunk from Sefaria."""
    ref: str  # e.g. "Bava Batra 33b:8"
    index: int
    hebrew: str
    english: str
    commentaries: list[Commentary] = Field(default_factory=list)


class Sugya(BaseModel):
    """A contiguous range of segments treated as one discussion unit."""
    title: str  # e.g. "Nesikha d'Rabbi Abba"
    base_ref: str  # e.g. "Bava Batra 33b"
    segments: list[Segment]

    def full_hebrew(self) -> str:
        return "\n\n".join(s.hebrew for s in self.segments)

    def full_english(self) -> str:
        return "\n\n".join(s.english for s in self.segments)


class Voice(BaseModel):
    """A named speaker in the sugya — will later become its own agent."""
    speaker: str  # e.g. "Rabbi Abba" (transliterated, not Hebrew)
    speaker_hebrew: str  # e.g. "רבי אבא"
    role: str  # "poser" | "resolver" | "challenger" | "narrator" | "commentator"
    position: str  # plain-language summary of what they hold
    reasoning: str  # the *why* behind the position
    segment_refs: list[str] = Field(default_factory=list)  # where they speak


class Understanding(BaseModel):
    """Stage 1 output — the comprehension pass over a sugya."""
    sugya_title: str
    scenario: str  # the concrete fact pattern, told as a story
    central_tension: str  # what's at stake; what question is the sugya asking
    voices: list[Voice]
    meforshim_notes: str  # how Rashbam/Tosafot shape the reading
    outstanding_questions: list[str] = Field(default_factory=list)  # kushyos for Stage 4
