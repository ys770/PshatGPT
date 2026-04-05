"""Stage 1 Comprehension Agent — reads a sugya + meforshim, produces Understanding."""
from __future__ import annotations

import json
import re
from typing import Any

from gemara.agents.base import BaseAgent
from gemara.models import Sugya, Understanding, Voice

SYSTEM_PROMPT = """You are a rigorous Gemara learner producing a comprehension pass over a sugya.

Your job is to read:
  (a) the plain Gemara text (Hebrew/Aramaic + English)
  (b) all attached meforshim (Rashbam/Rashi + Tosafot, in Hebrew)

...and produce a structured, honest reading that a student can trust before
they proceed to adversarial analysis.

Rules:
- Do not invent voices. Only name speakers who actually appear in the text.
- Distinguish the amoraic/tannaic voices from the stam (anonymous narrator).
- Attribute each position to its actual segment reference.
- Note *where Rashbam and Tosafot disagree on how to read the sugya*.
- Surface real kushyos (questions) that the text itself raises or invites.
- Do not paper over tension — if the sugya is difficult, say so.

Output ONLY valid JSON matching this schema (no prose outside JSON, no code fences):

{
  "scenario": "<the concrete factual case, as a plain-language story>",
  "central_tension": "<the core question the sugya is wrestling with>",
  "voices": [
    {
      "speaker": "<English name, e.g. 'Rabbi Abba'>",
      "speaker_hebrew": "<Hebrew, e.g. 'רבי אבא'>",
      "role": "<poser|resolver|challenger|narrator|commentator>",
      "position": "<what they hold>",
      "reasoning": "<why they hold it>",
      "segment_refs": ["<ref>", ...]
    }
  ],
  "meforshim_notes": "<how Rashbam/Tosafot shape or contest the reading>",
  "outstanding_questions": ["<kushya that is still open>", ...]
}
"""


def _parse_json_lenient(raw: str) -> dict:
    """Extract JSON from a model response, tolerating markdown fences and prose."""
    raw = raw.strip()
    # Strip ``` or ```json fences if present.
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", raw, re.DOTALL)
    if fence:
        raw = fence.group(1).strip()
    # If there's still leading prose, grab the first {...} block.
    if not raw.startswith("{"):
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            raw = match.group(0)
    return json.loads(raw)


def _format_sugya_for_prompt(sugya: Sugya) -> str:
    """Render sugya text + commentaries as one prompt block."""
    lines: list[str] = []
    lines.append(f"# Sugya: {sugya.title} ({sugya.base_ref})\n")
    for seg in sugya.segments:
        lines.append(f"## Segment [{seg.index}] — {seg.ref}")
        lines.append(f"**Hebrew/Aramaic:** {seg.hebrew}")
        lines.append(f"**English:** {seg.english}")
        if seg.commentaries:
            lines.append("")
            lines.append("### Meforshim on this segment:")
            for c in seg.commentaries:
                lines.append(f"- **{c.commentator} ({c.ref})**: {c.hebrew}")
        lines.append("")
    return "\n".join(lines)


class ComprehensionAgent(BaseAgent):
    def __init__(self, llm: Any) -> None:
        # Low temperature — comprehension should be faithful, not creative.
        super().__init__(llm, temperature=0.2)

    def _build_system_prompt(self, **kwargs: Any) -> str:
        return SYSTEM_PROMPT

    def _build_user_message(self, sugya: Sugya, **kwargs: Any) -> str:
        return _format_sugya_for_prompt(sugya) + (
            "\n\nProduce the comprehension JSON now."
        )

    def understand(self, sugya: Sugya) -> Understanding:
        raw = self.run(sugya=sugya)
        try:
            data = _parse_json_lenient(raw)
        except json.JSONDecodeError as e:
            print("=== RAW LLM OUTPUT (parse failed) ===")
            print(raw[:2000])
            print("=== END RAW ===")
            raise ValueError(f"JSON parse failed: {e}; raw starts: {raw[:200]!r}")
        return Understanding(
            sugya_title=sugya.title,
            scenario=data["scenario"],
            central_tension=data["central_tension"],
            voices=[Voice(**v) for v in data["voices"]],
            meforshim_notes=data.get("meforshim_notes", ""),
            outstanding_questions=data.get("outstanding_questions", []),
        )
