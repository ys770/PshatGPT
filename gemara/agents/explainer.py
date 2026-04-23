"""Explain-on-click agent: given a ref, stream a contextual explanation."""
from __future__ import annotations

from typing import Iterator

from gemara.llm import LLMClient

SYSTEM_PROMPT = """You are a patient chavrusa explaining one small piece of Gemara to a learner.

You'll receive ONE unit — either a Gemara line, a Rashbam/Rashi dibur hamatchil,
or a Tosafot dibur hamatchil — together with relevant context from the daf.

Explain it clearly and contextually:

1. **Translate** the Hebrew/Aramaic into natural English (not a word-for-word gloss).
2. **Locate** it: what is the gemara doing at this point? What question or claim
   is being made, and how does this unit advance it?
3. **Unpack** the reasoning: what's the logical move? What assumption does it
   rely on? What's the chiddush (the novel point)?
4. **For Rashbam/Rashi**: what problem in the text is the mefaresh solving?
   What would a learner have missed without this comment?
5. **For Tosafot**: what kushya is being asked, from where, and what's the tirutz?
   Tosafot often cross-references other sugyot — name them if invoked.

Keep it conversational but precise. Use Hebrew/Aramaic terms with transliteration
and English, like "chazaka (presumptive ownership)". Don't pad. Stop when the
explanation is complete — usually 150-400 words is enough.
"""


def _build_context(item: dict) -> str:
    """Format the clicked item + its context into a prompt."""
    kind = item["kind"]
    lines = []

    if kind == "gemara":
        lines.append(f"**Clicked: Gemara segment {item['daf_ref']}:{item['seg_index']}**")
        lines.append("")
        lines.append(f"Hebrew/Aramaic: {item['text']}")
        lines.append("")
        lines.append(f"Existing English translation (William Davidson): {item.get('english', '')}")
        lines.append("")
        lines.append("Explain this gemara line.")

    elif kind == "commentary":
        lines.append(f"**Clicked: {item['commentator']} on {item['daf_ref']}:{item['seg_index']}**")
        lines.append("")
        lines.append(f"The gemara line this comments on:")
        lines.append(f"  Hebrew: {item['on_segment_hebrew']}")
        lines.append(f"  English: {item.get('on_segment_english', '')}")
        lines.append("")
        lines.append(f"{item['commentator']}'s comment (Hebrew):")
        lines.append(f"  {item['text']}")
        lines.append("")
        lines.append(f"Explain this {item['commentator']}.")

    else:
        lines.append(f"Item: {item.get('text', '')}")
        lines.append("Explain it.")

    return "\n".join(lines)


def explain_stream(llm: LLMClient, item: dict) -> Iterator[dict]:
    """Stream explanation events for a clicked item.

    Yields dicts: {"type": "text", "text": "..."} chunks followed by a
    terminal {"type": "done", "stop_reason": "..."} event.
    """
    user_msg = _build_context(item)
    yield from llm.stream(SYSTEM_PROMPT, user_msg, temperature=0.3)
