#!/usr/bin/env python3
"""Локальный тест AudioSocket ⇄ WebSocket моста — без реальной телефонии.

Проверяем, что мост:
  * принимает AudioSocket-соединение, читает UUID и открывает WS к /ws/audio/{call_id};
  * прокачивает аудио каллера (кадры 0x10) в WS;
  * прокачивает аудио робота из WS обратно в AudioSocket-кадры 0x10.

WS-сервер aicallrobot мокается: он эхо-отвечает на бинарные чанки, имитируя TTS.

Запуск: python -m tests.test_audiosocket_bridge   (или pytest)
"""

import asyncio
import os
import sys
import uuid as uuid_lib

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import websockets  # noqa: E402

from app.services.audiosocket_bridge import (  # noqa: E402
    AudioSocketServer,
    encode_frame,
    read_frame,
    KIND_UUID,
    KIND_AUDIO,
    KIND_HANGUP,
)

PCM_FRAME = bytes([0x11, 0x22] * 160)  # 320 байт = 20 мс SLIN 8 кГц 16 бит


async def _run_scenario() -> None:
    received_on_ws: list[bytes] = []
    ws_ready = asyncio.Event()

    async def mock_ws_handler(websocket):
        ws_ready.set()
        async for message in websocket:
            if isinstance(message, (bytes, bytearray)):
                received_on_ws.append(bytes(message))
                # Имитируем TTS: эхо ровно 320 байт обратно.
                await websocket.send(bytes(message))
            else:
                # JSON-команды ({"action":"end"} и т.п.) — просто игнорируем.
                pass

    # 1. Поднимаем мок WS-сервера aicallrobot.
    ws_server = await websockets.serve(mock_ws_handler, "127.0.0.1", 8769)

    # 2. Поднимаем AudioSocket-мост, направленный на этот WS.
    bridge = AudioSocketServer(
        host="127.0.0.1",
        port=19092,
        ws_base_url="ws://127.0.0.1:8769",
        call_manager=None,
    )
    await bridge.start()

    try:
        # 3. Подключаемся как Asterisk: UUID + аудиокадр, читаем эхо обратно.
        reader, writer = await asyncio.open_connection("127.0.0.1", 19092)
        call_id = uuid_lib.uuid4()
        writer.write(encode_frame(KIND_UUID, call_id.bytes))
        writer.write(encode_frame(KIND_AUDIO, PCM_FRAME))
        await writer.drain()

        kind, payload = await asyncio.wait_for(read_frame(reader), timeout=5.0)
        assert kind == KIND_AUDIO, f"ожидали аудиокадр, получили {kind:#x}"
        assert payload == PCM_FRAME, "эхо-аудио из WS не совпало с отправленным"

        # 4. Завершаем звонок.
        writer.write(encode_frame(KIND_HANGUP))
        await writer.drain()
        writer.close()

        await asyncio.sleep(0.2)
        assert received_on_ws, "WS не получил аудио каллера от моста"
        assert received_on_ws[0] == PCM_FRAME, "аудио каллера дошло до WS искажённым"
        print("OK: UUID разобран, аудио прокачано в обе стороны")
    finally:
        await bridge.stop()
        ws_server.close()
        await ws_server.wait_closed()


def test_audiosocket_bridge_roundtrip():
    asyncio.run(_run_scenario())


if __name__ == "__main__":
    test_audiosocket_bridge_roundtrip()
    print("=" * 50)
    print("Все проверки AudioSocket-моста пройдены ✅")
