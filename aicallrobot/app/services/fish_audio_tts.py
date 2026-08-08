"""fish.audio TTS — REST API (https://api.fish.audio).

Синтез речи через fish.audio. Ключ и голос (reference_id выбранной пользователем
модели) обычно приходят из DentaFlow в рантайме (см. app/core/runtime_credentials.py).

Для телефонии запрашиваем сырой PCM 16-бит LE моно на 8 кГц (формат SLIN, который
принимает Asterisk через AudioSocket) и низколатентный режим ``latency="balanced"``
— первый аудио-пакет приходит ~300 мс, что резко сокращает паузу перед ответом.
"""

import httpx
from collections.abc import AsyncGenerator
from loguru import logger

from app.core.config import get_settings


class FishAudioTTSService:
    """Синтез речи через fish.audio REST API."""

    TTS_URL = "https://api.fish.audio/v1/tts"
    MODELS_URL = "https://api.fish.audio/model"

    def __init__(self):
        self.settings = get_settings()
        # Персистентный клиент: переиспользует TCP/TLS-соединения.
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=5.0),
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
        )

    def _request_headers(self) -> dict:
        # Ключ и модель читаются на каждый вызов — учитывают рантайм-обновления.
        return {
            "Authorization": f"Bearer {self.settings.fish_audio_api_key}",
            "Content-Type": "application/json",
            "model": self.settings.fish_audio_model or "speech-1.6",
        }

    def _build_body(self, text: str, voice: str | None, sample_rate: int) -> dict:
        body: dict = {
            "text": text,
            "format": "pcm",
            "sample_rate": sample_rate,
            "latency": "balanced",  # низкая задержка первого пакета
            "normalize": True,
        }
        voice = voice or self.settings.fish_audio_voice
        if voice:
            body["reference_id"] = voice
        return body

    async def synthesize(
        self, text: str, voice: str | None = None, sample_rate: int | None = None,
    ) -> bytes:
        """Синтез целиком: собирает все PCM-чанки и возвращает одним блоком."""
        chunks = [chunk async for chunk in self.synthesize_stream(text, voice, sample_rate)]
        audio = b"".join(chunks)
        logger.info(f"fish.audio TTS ok: {len(audio)} bytes")
        return audio

    async def synthesize_stream(
        self, text: str, voice: str | None = None, sample_rate: int | None = None,
    ) -> AsyncGenerator[bytes, None]:
        """Стриминг синтеза: отдаёт PCM-чанки по мере поступления от API."""
        if not self.settings.fish_audio_api_key:
            raise RuntimeError("fish.audio API key is not configured")

        sample_rate = sample_rate or self.settings.audio_sample_rate
        voice = voice or self.settings.fish_audio_voice
        body = self._build_body(text, voice, sample_rate)
        logger.info(f"fish.audio TTS stream: voice={voice or '-'}, text='{text[:50]}...'")

        async with self._client.stream(
            "POST", self.TTS_URL, headers=self._request_headers(), json=body,
        ) as response:
            if response.status_code != 200:
                err = await response.aread()
                logger.error(f"fish.audio TTS error {response.status_code}: {err[:300]}")
                raise Exception(f"fish.audio TTS failed: {response.status_code}")

            total = 0
            async for chunk in response.aiter_bytes():
                if chunk:
                    total += len(chunk)
                    yield chunk
            logger.info(f"fish.audio TTS stream ok: {total} bytes total")

    async def list_voices(self, api_key: str | None = None) -> list[dict]:
        """Список собственных голосов пользователя (self=true)."""
        key = api_key or self.settings.fish_audio_api_key
        if not key:
            raise RuntimeError("fish.audio API key is not configured")
        resp = await self._client.get(
            self.MODELS_URL,
            headers={"Authorization": f"Bearer {key}"},
            params={"self": "true", "page_size": 100},
        )
        resp.raise_for_status()
        data = resp.json()
        items = data.get("items", data) if isinstance(data, dict) else data
        return [
            {"id": it.get("_id") or it.get("id"), "title": it.get("title", "")}
            for it in (items or [])
            if it.get("_id") or it.get("id")
        ]
