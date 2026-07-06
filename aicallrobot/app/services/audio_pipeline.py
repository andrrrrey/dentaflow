"""Audio pipeline: buffer management, VAD (voice activity detection), interruption handling."""

import asyncio
import time
from dataclasses import dataclass, field
from loguru import logger


@dataclass
class AudioBuffer:
    """Буфер аудиоданных с определением пауз и перебиваний.

    VAD адаптивный: телефонная линия всегда несёт «комфортный шум» (звук идёт
    непрерывно даже в тишине абонента), поэтому фиксированный порог не работает —
    шум либо принимается за речь (пауза не находится, ASR не стартует), либо речь
    тонет под порогом. Мы ведём бегущую оценку шумового пола и считаем речью только
    энергию, заметно превышающую этот пол.
    """

    sample_rate: int = 8000
    silence_threshold: int = 350       # абсолютный минимум порога голоса
    pause_duration: float = 1.0        # пауза = конец реплики (сек)
    interrupt_duration: float = 0.15   # порог для перебивания (сек)
    noise_factor: float = 2.2          # речь = энергия выше шумового пола ×коэффициент
    max_utterance_sec: float = 12.0    # страховка: форс ASR при бесконечной «речи»

    _buffer: bytearray = field(default_factory=bytearray)
    _last_voice_time: float = 0.0
    _speech_started: bool = False
    _speech_start_time: float = 0.0
    _noise_floor: float | None = None

    def add_chunk(self, chunk: bytes) -> dict:
        """
        Добавляет чанк аудио в буфер и анализирует.

        Returns:
            dict с ключами:
                - has_speech: bool — есть ли речь
                - pause_detected: bool — обнаружена пауза (конец реплики)
                - interrupt_detected: bool — обнаружено перебивание
                - buffer_ms: int — длина буфера в мс
        """
        self._buffer.extend(chunk)
        now = time.time()

        energy = self._chunk_energy(chunk)
        # Адаптивный шумовой пол: быстро опускается к тишине, медленно поднимается.
        if self._noise_floor is None:
            self._noise_floor = energy
        elif energy < self._noise_floor:
            self._noise_floor = energy
        else:
            self._noise_floor = 0.995 * self._noise_floor + 0.005 * energy
        threshold = max(self.silence_threshold, self._noise_floor * self.noise_factor)
        is_voice = energy > threshold

        result = {
            "has_speech": False,
            "pause_detected": False,
            "interrupt_detected": False,
            "buffer_ms": len(self._buffer) * 1000 // (self.sample_rate * 2),
        }

        if is_voice:
            if not self._speech_started:
                self._speech_started = True
                self._speech_start_time = now
                logger.debug(f"Speech started (energy={energy:.0f}, floor={self._noise_floor:.0f})")
            self._last_voice_time = now
            result["has_speech"] = True
        elif self._speech_started:
            silence_duration = now - self._last_voice_time
            if silence_duration >= self.pause_duration:
                result["pause_detected"] = True
                self._speech_started = False
                logger.debug(f"Pause detected after {silence_duration:.2f}s silence")

        # Страховка от шумной линии: реплика тянется без паузы — форсируем распознавание.
        if self._speech_started and (now - self._speech_start_time) >= self.max_utterance_sec:
            result["pause_detected"] = True
            self._speech_started = False
            logger.debug("Max utterance length reached — forcing recognition")

        return result

    def _chunk_energy(self, chunk: bytes) -> float:
        """Средняя абсолютная амплитуда чанка (2 байта на сэмпл, little-endian)."""
        if len(chunk) < 2:
            return 0.0
        total = 0
        count = 0
        for i in range(0, len(chunk) - 1, 2):
            total += abs(int.from_bytes(chunk[i:i + 2], byteorder="little", signed=True))
            count += 1
        return total / count if count else 0.0

    def get_audio(self) -> bytes:
        """Возвращает буфер и очищает его."""
        audio = bytes(self._buffer)
        self._buffer.clear()
        self._speech_started = False
        return audio

    def clear(self):
        """Полностью очищает буфер."""
        self._buffer.clear()
        self._speech_started = False
        self._last_voice_time = 0.0

    @property
    def duration_ms(self) -> int:
        return len(self._buffer) * 1000 // (self.sample_rate * 2)

    @property
    def is_empty(self) -> bool:
        return len(self._buffer) == 0


class AudioPipeline:
    """
    Пайплайн обработки аудио в реальном времени.
    Координирует буфер, ASR и TTS.
    """

    def __init__(self, asr_service, tts_service, on_text_recognized=None, on_audio_ready=None):
        self.asr = asr_service
        self.tts = tts_service
        self.buffer = AudioBuffer()
        self.on_text_recognized = on_text_recognized
        self.on_audio_ready = on_audio_ready
        self._is_speaking = False  # робот сейчас говорит
        self._interrupted = False

    async def process_chunk(self, chunk: bytes) -> dict | None:
        """
        Обрабатывает входящий аудиочанк.
        Возвращает результат распознавания при обнаружении паузы.
        """
        result = self.buffer.add_chunk(chunk)

        # Определение перебивания: клиент говорит, пока робот говорит
        if result["has_speech"] and self._is_speaking:
            self._interrupted = True
            logger.info("Interruption detected — client is speaking over the robot")
            return {"type": "interrupt"}

        # Пауза — конец реплики, запускаем распознавание
        if result["pause_detected"] and not self.buffer.is_empty:
            audio_data = self.buffer.get_audio()
            if len(audio_data) > 1600:  # минимум 100ms аудио
                try:
                    text = await self.asr.recognize_short(audio_data)
                    if text and self.on_text_recognized:
                        await self.on_text_recognized(text)
                    return {"type": "recognition", "text": text}
                except Exception as e:
                    logger.error(f"ASR error: {e}")
                    return {"type": "error", "error": str(e)}

        return None

    async def speak(self, text: str) -> bytes:
        """Синтезирует речь и помечает, что робот говорит."""
        self._is_speaking = True
        self._interrupted = False
        try:
            audio = await self.tts.synthesize(text)
            if self.on_audio_ready:
                await self.on_audio_ready(audio)
            return audio
        finally:
            self._is_speaking = False

    @property
    def was_interrupted(self) -> bool:
        return self._interrupted

    def reset_interrupt(self):
        self._interrupted = False
