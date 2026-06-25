import { useCallback, useRef, useState } from "react";
import { api } from "../api/client";

/**
 * Голосовой «Тест диалога»: захват микрофона → PCM 8кГц по WebSocket к
 * aicallrobot (через прокси DentaFlow) и воспроизведение ответного аудио.
 * Логика портирована из admin.html aicallrobot.
 */

export type VoiceState = "idle" | "connecting" | "listening" | "processing" | "speaking";

export interface VoiceMsg {
  role: "robot" | "user" | "system";
  text: string;
  meta?: string;
}

export interface VoiceOptions {
  voice?: string;
  role?: string;
  speed?: number;
}

export function useVoiceDialog() {
  const [state, setState] = useState<VoiceState>("idle");
  const [messages, setMessages] = useState<VoiceMsg[]>([]);
  const [phaseLabel, setPhaseLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const nextPlayRef = useRef(0);
  const mutedRef = useRef(false);

  const append = useCallback((m: VoiceMsg) => setMessages((prev) => [...prev, m]), []);

  function getPlayCtx(): AudioContext {
    if (!playCtxRef.current) {
      playCtxRef.current = new AudioContext({ sampleRate: 8000 });
      nextPlayRef.current = 0;
    }
    return playCtxRef.current;
  }

  function playPcm(i16: Int16Array, { duckMic = false }: { duckMic?: boolean } = {}) {
    const ctx = getPlayCtx();
    const f32 = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
    const buf = ctx.createBuffer(1, f32.length, 8000);
    buf.copyToChannel(f32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const now = ctx.currentTime;
    if (nextPlayRef.current < now) nextPlayRef.current = now;
    src.start(nextPlayRef.current);
    nextPlayRef.current += buf.duration;
    if (duckMic) {
      mutedRef.current = true;
      src.onended = () => {
        if (nextPlayRef.current <= ctx.currentTime + 0.15) {
          mutedRef.current = false;
          setState("listening");
        }
      };
    }
  }

  async function playTtsText(text: string, opts: VoiceOptions) {
    try {
      const { data } = await api.post("/ai-calling/tts-test", {
        text,
        voice: opts.voice || undefined,
        role: opts.role || undefined,
        speed: opts.speed || undefined,
      });
      const pcm = Uint8Array.from(atob(data.audio_base64), (c) => c.charCodeAt(0));
      playPcm(new Int16Array(pcm.buffer));
    } catch {
      /* greeting playback is best-effort */
    }
  }

  function handleMsg(msg: any) {
    if (msg.type === "recognition") {
      append({ role: "user", text: msg.text });
      setState("processing");
    } else if (msg.type === "response") {
      append({ role: "robot", text: msg.text, meta: msg.intent || msg.step || "" });
      setState("speaking");
    } else if (msg.type === "interrupt") {
      setState("listening");
    } else if (msg.type === "phase") {
      setPhaseLabel(msg.phase_label || msg.phase || "");
    } else if (msg.type === "step_changed") {
      append({ role: "system", text: `Шаг изменён: ${msg.step}` });
    }
  }

  async function startMic() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    streamRef.current = stream;
    const ctx = new AudioContext({ sampleRate: 8000 });
    micCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(1024, 1, 1);
    procRef.current = proc;
    proc.onaudioprocess = (e) => {
      const ws = wsRef.current;
      if (mutedRef.current || !ws || ws.readyState !== WebSocket.OPEN) return;
      const f32 = e.inputBuffer.getChannelData(0);
      const i16 = new Int16Array(f32.length);
      for (let i = 0; i < f32.length; i++) {
        i16[i] = Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767)));
      }
      ws.send(i16.buffer);
    };
    source.connect(proc);
    proc.connect(ctx.destination);
  }

  function stopMic() {
    if (procRef.current) { try { procRef.current.disconnect(); } catch { /* noop */ } procRef.current = null; }
    if (micCtxRef.current) { try { micCtxRef.current.close(); } catch { /* noop */ } micCtxRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }

  const start = useCallback(async (opts: VoiceOptions) => {
    setError(null);
    setMessages([]);
    setPhaseLabel("");
    setState("connecting");
    try {
      const { data } = await api.post("/ai-calling/calls/start", {});
      const callId: string = data.call_id;
      if (data.greeting) {
        append({ role: "robot", text: data.greeting });
        await playTtsText(data.greeting, opts);
      }

      const token = localStorage.getItem("access_token") || "";
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${proto}://${window.location.host}/api/v1/ai-calling/ws/audio/${callId}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = async () => {
        ws.send(JSON.stringify({
          action: "config",
          provider: "yandex",
          voice: opts.voice || "alena",
          role: opts.role || "neutral",
          speed: opts.speed || 1.0,
        }));
        try {
          await startMic();
          setState("listening");
        } catch (e: any) {
          setError("Нет доступа к микрофону: " + (e?.message || ""));
          stop();
        }
      };
      ws.onmessage = (ev) => {
        if (ev.data instanceof ArrayBuffer) {
          playPcm(new Int16Array(ev.data), { duckMic: true });
        } else {
          try { handleMsg(JSON.parse(ev.data)); } catch { /* noop */ }
        }
      };
      ws.onclose = () => { stopMic(); setState("idle"); };
      ws.onerror = () => { setError("Ошибка WebSocket-соединения"); };
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || "Ошибка запуска");
      setState("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [append]);

  const stop = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      try { ws.send(JSON.stringify({ action: "end" })); } catch { /* noop */ }
      try { ws.close(); } catch { /* noop */ }
      wsRef.current = null;
    }
    stopMic();
    setState("idle");
  }, []);

  return { state, messages, phaseLabel, error, start, stop };
}
