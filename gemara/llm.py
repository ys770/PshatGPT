"""Anthropic client wrapper. Loads ANTHROPIC_API_KEY from env (or .env)."""
from __future__ import annotations

import os
from pathlib import Path

import anthropic


def _load_dotenv() -> None:
    """Minimal .env loader — no python-dotenv dependency needed."""
    env_file = Path(__file__).parent.parent / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()


class LLMClient:
    def __init__(
        self,
        model: str = "claude-sonnet-4-5",
        max_tokens: int = 4096,
        api_key: str | None = None,
    ):
        # Prefer explicit api_key, fall back to env.
        key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise RuntimeError(
                "No Anthropic API key provided. Enter one in Settings (⚙) "
                "or set ANTHROPIC_API_KEY in .env."
            )
        self.client = anthropic.Anthropic(api_key=key)
        self.model = model
        self.max_tokens = max_tokens

    def call(self, system: str, user_message: str, temperature: float = 0.5) -> str:
        response = self.client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            temperature=temperature,
            system=system,
            messages=[{"role": "user", "content": user_message}],
        )
        return response.content[0].text

    def stream(self, system: str, user_message: str, temperature: float = 0.5):
        """Yield text chunks as they arrive from Claude."""
        with self.client.messages.stream(
            model=self.model,
            max_tokens=self.max_tokens,
            temperature=temperature,
            system=system,
            messages=[{"role": "user", "content": user_message}],
        ) as s:
            for chunk in s.text_stream:
                yield chunk
