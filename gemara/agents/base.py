from __future__ import annotations

from typing import Any

from gemara.llm import LLMClient


class BaseAgent:
    def __init__(self, llm: LLMClient, temperature: float = 0.3):
        self.llm = llm
        self.temperature = temperature

    def _build_system_prompt(self, **kwargs: Any) -> str:
        raise NotImplementedError

    def _build_user_message(self, **kwargs: Any) -> str:
        raise NotImplementedError

    def run(self, **kwargs: Any) -> str:
        system = self._build_system_prompt(**kwargs)
        user_msg = self._build_user_message(**kwargs)
        return self.llm.call(system, user_msg, temperature=self.temperature)
