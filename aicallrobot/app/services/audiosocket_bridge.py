"""AudioSocket ⇄ WebSocket мост для телефонных звонков.

Asterisk (через приложение AudioSocket) открывает TCP-соединение на каждый
звонок и стримит аудио каллера в формате SLIN (signed linear PCM, 8 кГц,
16 бит, моно, little-endian) — ровно тот формат, который уже принимает
WebSocket `/ws/audio/{call_id}` сервиса aicallrobot.

Этот мост:
  * принимает AudioSocket-подключение от Asterisk;
  * читает первый кадр UUID — это и есть `call_id` (его задаёт оркестратор
    при `AudioSocket(${call_id},bridge:9092)` в dialplan);
  * открывает WS-клиент к существующему `/ws/audio/{call_id}` и далее
    перекачивает аудио в обе стороны без перекодирования.

Вся логика диалога (ASR → классификация → TTS) остаётся в WS-обработчике —
мост её не дублирует.

Протокол AudioSocket (Asterisk res_audiosocket):
    [kind:1][length:2 big-endian][payload:length]
    kind 0x00 = hangup (length 0)
    kind 0x01 = UUID (16 байт)
    kind 0x03 = DTMF (1 байт ASCII)
    kind 0x10 = audio (SLIN 8 кГц, обычно 320 байт = 20 мс)
    kind 0xff = error (1 байт код)
"""

from __future__ import annotations

import asyncio
import json
import uuid as uuid_lib

import websockets
from loguru import logger

# Типы кадров AudioSocket
KIND_HANGUP = 0x00
KIND_UUID = 0x01
KIND_DTMF = 0x03
KIND_AUDIO = 0x10
KIND_ERROR = 0xFF

# Размер аудиокадра, который шлём обратно в Asterisk: 20 мс SLIN 8 кГц 16 бит
# = 8000 * 0.02 * 2 байта = 320 байт.
FRAME_BYTES = 320


def encode_frame(kind: int, payload: bytes = b"") -> bytes:
    """Кодирует один AudioSocket-кадр."""
    return bytes([kind]) + len(payload).to_bytes(2, "big") + payload


async def read_frame(reader: asyncio.StreamReader) -> tuple[int, bytes] | None:
    """Читает один AudioSocket-кадр. Возвращает (kind, payload) или None при EOF."""
    header = await reader.readexactly(3)
    kind = header[0]
    length = int.from_bytes(header[1:3], "big")
    payload = await reader.readexactly(length) if length else b""
    return kind, payload


class AudioSocketBridge:
    """Мост одного звонка: AudioSocket(TCP) ⇄ WebSocket(/ws/audio/{call_id})."""

    def __init__(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        ws_base_url: str,
        call_manager=None,
    ) -> None:
        self._reader = reader
        self._writer = writer
        self._ws_base_url = ws_base_url.rstrip("/")
        self._call_manager = call_manager
        self._out_buffer = bytearray()  # буфер аудио из WS → нарезаем на кадры 320 байт

    async def run(self) -> None:
        # 1. Первый кадр от Asterisk должен быть UUID → это call_id.
        call_id = await self._read_call_id()
        if not call_id:
            logger.warning("AudioSocket: соединение закрыто до получения UUID")
            self._writer.close()
            return

        ws_url = f"{self._ws_base_url}/ws/audio/{call_id}"
        logger.info(f"AudioSocket: звонок {call_id} → подключаюсь к {ws_url}")

        try:
            async with websockets.connect(ws_url, max_size=None) as ws:
                await self._maybe_send_greeting(ws, call_id)
                # Качаем аудио в обе стороны параллельно.
                await asyncio.gather(
                    self._pump_asterisk_to_ws(ws),
                    self._pump_ws_to_asterisk(ws),
                )
        except Exception as exc:  # noqa: BLE001 — мост не должен ронять сервер
            logger.error(f"AudioSocket bridge error (call={call_id}): {exc}")
        finally:
            self._writer.close()
            logger.info(f"AudioSocket: звонок {call_id} завершён")

    async def _read_call_id(self) -> str | None:
        """Читает кадры, пока не встретит UUID. Возвращает call_id-строку."""
        while True:
            try:
                frame = await read_frame(self._reader)
            except asyncio.IncompleteReadError:
                return None
            if frame is None:
                return None
            kind, payload = frame
            if kind == KIND_UUID:
                try:
                    return str(uuid_lib.UUID(bytes=payload))
                except (ValueError, TypeError):
                    # Не каноничный UUID — используем как есть (hex/ascii).
                    return payload.decode("ascii", "ignore") or payload.hex()
            if kind == KIND_HANGUP:
                return None
            # Любые ранние аудио/DTMF до UUID игнорируем.

    async def _maybe_send_greeting(self, ws, call_id: str) -> None:
        """Если у сессии есть приветствие — просим робота произнести его первым."""
        if self._call_manager is None:
            return
        try:
            session = await self._call_manager.get_call(call_id)
            if not session:
                return
            greeting = next(
                (t.get("text") for t in session.transcript if t.get("role") == "robot"),
                "",
            )
            if greeting:
                await ws.send(json.dumps({"action": "speak", "text": greeting}))
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"AudioSocket: не удалось отправить приветствие: {exc}")

    async def _pump_asterisk_to_ws(self, ws) -> None:
        """Аудио каллера (Asterisk 0x10) → бинарные чанки WS."""
        while True:
            try:
                frame = await read_frame(self._reader)
            except asyncio.IncompleteReadError:
                break
            if frame is None:
                break
            kind, payload = frame
            if kind == KIND_AUDIO:
                if payload:
                    await ws.send(payload)
            elif kind == KIND_HANGUP:
                logger.info("AudioSocket: получен hangup от Asterisk")
                break
            elif kind == KIND_ERROR:
                logger.warning(f"AudioSocket: error frame {payload.hex()}")
        # Сообщаем WS, что звонок завершён, чтобы запустился пост-анализ.
        try:
            await ws.send(json.dumps({"action": "end"}))
        except Exception:  # noqa: BLE001
            pass

    async def _pump_ws_to_asterisk(self, ws) -> None:
        """Аудио робота (TTS из WS) → AudioSocket-кадры 0x10. JSON-сообщения игнорируем."""
        async for message in ws:
            if isinstance(message, bytes):
                self._out_buffer.extend(message)
                while len(self._out_buffer) >= FRAME_BYTES:
                    chunk = bytes(self._out_buffer[:FRAME_BYTES])
                    del self._out_buffer[:FRAME_BYTES]
                    self._writer.write(encode_frame(KIND_AUDIO, chunk))
                await self._writer.drain()
            # Текстовые JSON-кадры (recognition/response/phase/interrupt) для
            # телефонии не нужны — диалог уже отыгрывается на стороне WS.
        # Дослать остаток (выровняв до чётного числа байт = целые сэмплы).
        if self._out_buffer:
            tail = bytes(self._out_buffer)
            if len(tail) % 2:
                tail += b"\x00"
            self._writer.write(encode_frame(KIND_AUDIO, tail))
            await self._writer.drain()


class AudioSocketServer:
    """TCP-сервер AudioSocket. По соединению на звонок поднимает мост к WS."""

    def __init__(self, host: str, port: int, ws_base_url: str, call_manager=None) -> None:
        self._host = host
        self._port = port
        self._ws_base_url = ws_base_url
        self._call_manager = call_manager
        self._server: asyncio.AbstractServer | None = None

    async def _handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        peer = writer.get_extra_info("peername")
        logger.info(f"AudioSocket: новое соединение от {peer}")
        bridge = AudioSocketBridge(reader, writer, self._ws_base_url, self._call_manager)
        try:
            await bridge.run()
        except Exception as exc:  # noqa: BLE001
            logger.error(f"AudioSocket handler error: {exc}")

    async def start(self) -> None:
        self._server = await asyncio.start_server(self._handle, self._host, self._port)
        logger.info(f"AudioSocket-сервер слушает {self._host}:{self._port} → WS {self._ws_base_url}")

    async def stop(self) -> None:
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()
