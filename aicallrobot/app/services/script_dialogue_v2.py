"""Движок диалога v2.0 — каркас алгоритма без зашитого скрипта.

Алгоритм v2.0 сохранён по контракту (фазы, сессии, слой правок, форма ответа),
но текстовое наполнение скрипта удалено: ответы берутся из настраиваемого
словаря SCRIPT (по умолчанию пуст) либо из слоя правок (ScriptCorrectionsService).
Пока скрипт не настроен, движок возвращает плейсхолдер. Классификация реплик
выполняется через переданный LLM-сервис (OpenAI/ChatGPT) — он подключается,
когда скрипт наполнен.
"""

import time
from dataclasses import dataclass, field

from loguru import logger

from app.services.script_v2_data import SCRIPT, SCRIPT_NOT_CONFIGURED


_PHASE_LABELS: dict[str, str] = {
    "secretary": "Секретарь",
    "lpr_greeting": "ЛПР (приветствие)",
    "lpr_main": "ЛПР",
    "qualification": "Квалификация",
    "closed": "Завершён",
}


@dataclass
class V2SessionState:
    """Состояние сессии диалога v2."""
    session_id: str
    phase: str = "secretary"
    qual_step: int = 0
    last_robot_text: str = ""
    recent_exchanges: list = field(default_factory=list)
    created_at: float = field(default_factory=time.time)


class ScriptDialogueV2:
    """Каркас скриптового движка v2.0 (без зашитого скрипта).

    Args:
        gpt_service: LLM-сервис с методом ``complete(messages, ...)`` — для
            классификации реплик, когда скрипт настроен.
        corrections: опциональный ScriptCorrectionsService — слой правок,
            редактируемый в рантайме (раздел «Скрипты диалога»).
    """

    MAX_SESSIONS = 500

    def __init__(self, gpt_service, corrections=None):
        self.gpt = gpt_service
        self._corrections = corrections
        self._sessions: dict[str, V2SessionState] = {}

    # ── Управление сессиями ────────────────────────────────────────────────────

    def create_session(self, session_id: str) -> V2SessionState:
        if len(self._sessions) >= self.MAX_SESSIONS:
            oldest = min(self._sessions.values(), key=lambda s: s.created_at)
            del self._sessions[oldest.session_id]
        state = V2SessionState(session_id=session_id)
        self._sessions[session_id] = state
        return state

    def get_session(self, session_id: str) -> V2SessionState | None:
        return self._sessions.get(session_id)

    def delete_session(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    # ── Реплики ────────────────────────────────────────────────────────────────

    def greeting(self, session_id: str) -> dict:
        """Первая реплика диалога (приветствие)."""
        state = self.get_session(session_id) or self.create_session(session_id)
        text = SCRIPT.get("greeting") or SCRIPT_NOT_CONFIGURED
        state.last_robot_text = text
        return self._response(text, "secretary", "greeting", state)

    async def process_turn(self, session_id: str, user_text: str) -> dict:
        """Обрабатывает одну реплику пользователя.

        Пока скрипт не настроен, возвращает плейсхолдер. Если задан слой правок
        и реплика совпала с правкой — произносим «правильный» ответ из правки.
        """
        state = self.get_session(session_id) or self.create_session(session_id)
        user_text = (user_text or "").strip()

        if state.phase == "closed":
            text = SCRIPT.get("closed") or SCRIPT_NOT_CONFIGURED
            return self._response(text, "closed", "closed", state)

        node = "not_configured"
        robot_text = SCRIPT_NOT_CONFIGURED

        # Слой правок (настраивается в рантайме) имеет приоритет над пустым скриптом.
        if self._corrections is not None and user_text:
            try:
                override = await self._corrections.match(user_text, state.phase)
            except Exception as exc:  # слой правок не должен ронять диалог
                logger.error(f"[v2] corrections match failed: {exc}")
                override = None
            if override:
                robot_text, node = override, "correction"

        state.last_robot_text = robot_text
        if user_text:
            state.recent_exchanges.append({"role": "user", "text": user_text, "intent": node})
            state.recent_exchanges.append({"role": "robot", "text": robot_text})
            state.recent_exchanges = state.recent_exchanges[-10:]

        logger.info(
            f"[v2] session={session_id} phase={state.phase} node={node} "
            f"text='{user_text[:60]}'"
        )
        return self._response(robot_text, state.phase, node, state)

    # ── Вспомогательные ───────────────────────────────────────────────────────

    @staticmethod
    def _response(text: str, phase: str, node: str, state: V2SessionState) -> dict:
        return {
            "robot_text": text,
            "phase": phase,
            "phase_label": _PHASE_LABELS.get(phase, phase),
            "node": node,
            "qual_step": state.qual_step,
            "debug": {"classified_as": node, "phase_before": phase},
        }
