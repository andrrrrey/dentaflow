import { useMemo, useRef, useState } from "react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { Loader2, Play, Send, Trash2, Plus, Mic, Square, Phone } from "lucide-react";
import {
  useTtsVoices,
  useTtsTest,
  useDialogStart,
  useDialogTurn,
  useDialogDeleteSession,
  useScenarios,
  useScriptCorrections,
  useAddScriptCorrection,
  useDeleteScriptCorrection,
  useTestCall,
  useCallStatus,
  useCampaigns,
  useCampaignItems,
  useCreateCampaign,
  useCampaignControl,
  type Campaign,
} from "../api/aicalling";
import { useSegments } from "../api/segments";
import Pill from "../components/ui/Pill";
import { useVoiceDialog, type VoiceState, type VoiceMsg } from "../hooks/useVoiceDialog";

type Tab = "dialog" | "tts" | "scripts" | "campaigns";

const TABS: { key: Tab; label: string }[] = [
  { key: "dialog", label: "Тест диалога" },
  { key: "tts", label: "Тест TTS" },
  { key: "scripts", label: "Скрипты диалога" },
  { key: "campaigns", label: "Кампании" },
];

/* ---------- helpers ---------- */

// Yandex SpeechKit отдаёт сырой LPCM (16-bit mono). Оборачиваем в WAV для плеера.
function pcmBase64ToWavUrl(base64: string, sampleRate = 8000): string {
  const binary = atob(base64);
  const pcm = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) pcm[i] = binary.charCodeAt(i);

  const buffer = new ArrayBuffer(44 + pcm.length);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byteRate
  view.setUint16(32, 2, true); // blockAlign
  view.setUint16(34, 16, true); // bitsPerSample
  writeStr(36, "data");
  view.setUint32(40, pcm.length, true);
  new Uint8Array(buffer, 44).set(pcm);

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

/* Общий список реплик для текстового и голосового режима. */
function Transcript({ messages, empty }: { messages: ChatLike[]; empty: string }) {
  return (
    <div className="flex flex-col gap-2 min-h-[200px] max-h-[420px] overflow-y-auto p-2 rounded-xl bg-[rgba(91,76,245,0.04)]">
      {messages.length === 0 && (
        <div className="text-[12px] text-text-muted m-auto text-center px-4">{empty}</div>
      )}
      {messages.map((m, i) => (
        <div
          key={i}
          className={`max-w-[80%] px-3 py-2 rounded-xl text-[13px] ${
            m.role === "user"
              ? "self-end bg-accent2 text-white"
              : m.role === "system"
                ? "self-center bg-transparent text-text-muted text-[11px]"
                : "self-start bg-white border border-[rgba(91,76,245,0.12)]"
          }`}
        >
          {m.text}
          {m.role === "robot" && m.meta && (
            <div className="text-[10px] text-text-muted mt-1">{m.meta}</div>
          )}
        </div>
      ))}
    </div>
  );
}

interface ChatLike { role: "robot" | "user" | "system"; text: string; meta?: string; }

/* ---------- Тест TTS ---------- */

function TtsTab() {
  const { data: voices } = useTtsVoices();
  const ttsTest = useTtsTest();
  const [text, setText] = useState("Здравствуйте! Это тест синтеза речи.");
  const [voice, setVoice] = useState("");
  const [role, setRole] = useState("");
  const [speed, setSpeed] = useState("1.0");
  const [error, setError] = useState<string | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const selectedVoice = useMemo(
    () => voices?.find((v) => v.id === (voice || voices?.[0]?.id)),
    [voices, voice],
  );

  async function handleSpeak() {
    setError(null);
    try {
      const res = await ttsTest.mutateAsync({
        text,
        voice: voice || undefined,
        role: role || undefined,
        speed: parseFloat(speed) || undefined,
      });
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const url = pcmBase64ToWavUrl(res.audio_base64, res.sample_rate);
      audioUrlRef.current = url;
      setAudioUrl(url);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || "Ошибка синтеза");
    }
  }

  return (
    <Card className="max-w-[640px]">
      <div className="flex flex-col gap-3">
        <label className="text-[12px] font-semibold text-text-muted">Текст</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-[rgba(91,76,245,0.18)] p-3 text-[13px] outline-none focus:border-accent2"
        />

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-semibold text-text-muted">Голос</label>
            <select
              value={voice}
              onChange={(e) => { setVoice(e.target.value); setRole(""); }}
              className="rounded-xl border border-[rgba(91,76,245,0.18)] p-2 text-[13px] outline-none"
            >
              {(voices ?? []).map((v) => (
                <option key={v.id} value={v.id}>{v.id}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-semibold text-text-muted">Амплуа</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-xl border border-[rgba(91,76,245,0.18)] p-2 text-[13px] outline-none"
            >
              <option value="">по умолчанию</option>
              {(selectedVoice?.roles ?? []).map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-semibold text-text-muted">Скорость</label>
            <select
              value={speed}
              onChange={(e) => setSpeed(e.target.value)}
              className="rounded-xl border border-[rgba(91,76,245,0.18)] p-2 text-[13px] outline-none"
            >
              {["0.8", "1.0", "1.2", "1.5"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleSpeak} disabled={ttsTest.isPending || !text.trim()}>
            {ttsTest.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Озвучить
          </Button>
          {audioUrl && <audio src={audioUrl} controls autoPlay className="h-9" />}
        </div>
        {error && <div className="text-[12px] text-[#f44b6e]">{error}</div>}
      </div>
    </Card>
  );
}

/* ---------- Тест диалога: общий заголовок режима ---------- */

const VOICE_STATE_LABEL: Record<VoiceState, string> = {
  idle: "Не активно",
  connecting: "Подключение…",
  listening: "🎙 Слушаю…",
  processing: "⏳ Обработка…",
  speaking: "🔊 Говорит ИИ…",
};

/* ---------- Тестовый звонок на телефон ---------- */

const CALL_STATUS_LABELS: Record<string, string> = {
  pending: "Подготовка…",
  ringing: "Звоним…",
  active: "Идёт разговор…",
  completed: "Завершён",
  failed: "Ошибка",
};
function callStatusLabel(st?: string): string {
  return (st && CALL_STATUS_LABELS[st]) || (st ? st : "Инициируем звонок…");
}


function TestCallCard() {
  const scenarios = useScenarios();
  const testCall = useTestCall();
  const [phone, setPhone] = useState("");
  const [scenarioId, setScenarioId] = useState("default");
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const status = useCallStatus(activeCallId);
  const scen = scenarios.data ?? [];
  const err = (testCall.error as any)?.response?.data?.detail as string | undefined;
  const inputCls =
    "rounded-xl border border-[rgba(91,76,245,0.18)] p-2.5 text-[13px] outline-none focus:border-accent2";
  return (
    <Card className="max-w-[640px]">
      <h3 className="text-sm font-extrabold mb-1">Тестовый звонок на телефон</h3>
      <p className="text-[12px] text-text-muted mb-3">
        Робот позвонит на указанный номер, поздоровается и проведёт диалог по сценарию.
        Нужны настроенный SIP-транк Novofon и AMI-пароль (Интеграции → Novofon).
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex gap-3 flex-wrap items-center">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 900 000-00-00"
            className={`flex-1 min-w-[200px] ${inputCls}`}
          />
          <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)} className={inputCls}>
            {scen.length === 0 && <option value="default">default</option>}
            {scen.map((sc) => (
              <option key={sc.id} value={sc.id}>{sc.name}</option>
            ))}
          </select>
          <Button onClick={() => { setActiveCallId(null); testCall.mutate({ phone, scenario_id: scenarioId }, { onSuccess: (d) => setActiveCallId(d.call_id) }); }} disabled={testCall.isPending || !phone.trim()}>
            {testCall.isPending ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
            <span className="ml-1">Позвонить</span>
          </Button>
        </div>
        {testCall.isSuccess && (
          <div className="text-[12px] text-[#0a8f5b]">
            Звонок инициирован — ожидайте вызова на {phone}.
            {testCall.data?.greeting ? ` Робот начнёт с фразы: «${testCall.data.greeting}»` : ""}
          </div>
        )}
        {activeCallId && (
          <div className="rounded-xl border border-[rgba(91,76,245,0.12)] p-3 max-h-[320px] overflow-y-auto flex flex-col gap-2" style={{ background: "rgba(255,255,255,0.5)" }}>
            <div className="text-[11px] text-text-muted uppercase tracking-wider">{callStatusLabel(status.data?.status)}</div>
            {(status.data?.transcript ?? []).length === 0 && (
              <div className="text-[12px] text-text-muted">Ожидаем начало разговора…</div>
            )}
            {(status.data?.transcript ?? []).map((l, i) => (
              <div key={i} className={`text-[13px] ${l.role === "robot" ? "text-accent2" : l.role === "client" ? "text-text-main" : "text-text-muted italic"}`}>
                <b>{l.role === "robot" ? "Робот" : l.role === "client" ? "Пациент" : "—"}:</b> {l.text}
              </div>
            ))}
            {status.data?.summary && (
              <div className="text-[12px] text-text-muted mt-1 pt-2 border-t border-[rgba(0,0,0,0.06)]">Итог: {status.data.summary}</div>
            )}
          </div>
        )}
        {err && <div className="text-[12px] text-[#f44b6e]">{err}</div>}
      </div>
    </Card>
  );
}

/* ---------- Тест диалога ---------- */

function DialogTab() {
  const [mode, setMode] = useState<"text" | "voice">("text");

  // --- текстовый режим ---
  const startMut = useDialogStart();
  const turnMut = useDialogTurn();
  const deleteMut = useDialogDeleteSession();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatLike[]>([]);
  const [phaseLabel, setPhaseLabel] = useState("");
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  // --- голосовой режим ---
  const voice = useVoiceDialog();
  const { data: voices } = useTtsVoices();
  const [vVoice, setVVoice] = useState("alena");
  const [vSpeed, setVSpeed] = useState("1.0");

  async function handleStart() {
    setError(null);
    const id = crypto.randomUUID();
    try {
      const res = await startMut.mutateAsync({ session_id: id });
      setSessionId(id);
      setMessages([{ role: "robot", text: res.robot_text, meta: res.node }]);
      setPhaseLabel(res.phase_label);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || "Ошибка запуска");
    }
  }

  async function handleSend() {
    if (!sessionId || !input.trim()) return;
    const userText = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", text: userText }]);
    try {
      const res = await turnMut.mutateAsync({ session_id: sessionId, user_text: userText });
      setMessages((m) => [...m, { role: "robot", text: res.robot_text, meta: res.node }]);
      setPhaseLabel(res.phase_label);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || "Ошибка обработки");
    }
  }

  async function handleReset() {
    if (sessionId) await deleteMut.mutateAsync(sessionId).catch(() => {});
    setSessionId(null);
    setMessages([]);
    setPhaseLabel("");
    setError(null);
  }

  function switchMode(next: "text" | "voice") {
    if (next === mode) return;
    // покидаем активную сессию текущего режима
    if (mode === "voice") voice.stop();
    else if (sessionId) handleReset();
    setMode(next);
  }

  const voiceActive = voice.state !== "idle";

  return (
    <div className="flex flex-col gap-[18px]">
    <TestCallCard />
    <Card className="max-w-[640px]">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex gap-[3px] p-1 rounded-lg bg-[rgba(91,76,245,0.07)]">
            {(["text", "voice"] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`px-3 py-[5px] rounded-md text-[12px] font-semibold border-none transition-all ${
                  mode === m ? "bg-white text-accent2 shadow-sm" : "text-text-muted bg-transparent cursor-pointer"
                }`}
              >
                {m === "text" ? "Текст" : "Голос"}
              </button>
            ))}
          </div>
          <div className="text-[12px] text-text-muted">
            Скрипт v2.0
            {mode === "text" && phaseLabel && <span className="ml-1">· фаза: {phaseLabel}</span>}
            {mode === "voice" && voice.phaseLabel && <span className="ml-1">· фаза: {voice.phaseLabel}</span>}
            {mode === "voice" && <span className="ml-1">· {VOICE_STATE_LABEL[voice.state]}</span>}
          </div>
        </div>

        {mode === "text" ? (
          sessionId ? (
            <Button variant="ghost" onClick={handleReset}>Сбросить</Button>
          ) : (
            <Button onClick={handleStart} disabled={startMut.isPending}>
              {startMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              Начать диалог
            </Button>
          )
        ) : voiceActive ? (
          <Button variant="ghost" onClick={() => voice.stop()}>
            <Square size={14} /> Завершить
          </Button>
        ) : (
          <Button onClick={() => voice.start({ voice: vVoice, speed: parseFloat(vSpeed) })} disabled={voice.state === "connecting"}>
            {voice.state === "connecting" ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
            Начать голосом
          </Button>
        )}
      </div>

      {mode === "voice" && !voiceActive && (
        <div className="grid grid-cols-2 gap-3 mb-3 max-w-[360px]">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-text-muted">Голос</label>
            <select value={vVoice} onChange={(e) => setVVoice(e.target.value)}
              className="rounded-xl border border-[rgba(91,76,245,0.18)] p-2 text-[13px] outline-none">
              {(voices ?? [{ id: "alena", roles: [] }]).map((v) => (
                <option key={v.id} value={v.id}>{v.id}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-text-muted">Скорость</label>
            <select value={vSpeed} onChange={(e) => setVSpeed(e.target.value)}
              className="rounded-xl border border-[rgba(91,76,245,0.18)] p-2 text-[13px] outline-none">
              {["0.8", "1.0", "1.2", "1.5"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}

      <Transcript
        messages={mode === "text" ? messages : (voice.messages as VoiceMsg[] as ChatLike[])}
        empty={
          mode === "text"
            ? "Нажмите «Начать диалог», чтобы протестировать алгоритм скрипта v2.0."
            : "Нажмите «Начать голосом», разрешите доступ к микрофону и говорите."
        }
      />

      {mode === "text" && sessionId && (
        <div className="flex items-center gap-2 mt-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ваша реплика…"
            className="flex-1 rounded-xl border border-[rgba(91,76,245,0.18)] p-2.5 text-[13px] outline-none focus:border-accent2"
          />
          <Button onClick={handleSend} disabled={turnMut.isPending || !input.trim()}>
            {turnMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </Button>
        </div>
      )}

      {(error || voice.error) && (
        <div className="text-[12px] text-[#f44b6e] mt-2">{mode === "text" ? error : voice.error}</div>
      )}
    </Card>
    </div>
  );
}

/* ---------- Скрипты диалога ---------- */

function ScriptsTab() {
  const { data: scenarios } = useScenarios();
  const { data: corrections } = useScriptCorrections();
  const addMut = useAddScriptCorrection();
  const delMut = useDeleteScriptCorrection();
  const [trigger, setTrigger] = useState("");
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState("any");

  async function handleAdd() {
    if (!trigger.trim() || !answer.trim()) return;
    await addMut.mutateAsync({
      trigger: trigger.trim(),
      correct_answer: answer.trim(),
      current_answer: "",
      phase,
      enabled: true,
    });
    setTrigger("");
    setAnswer("");
  }

  return (
    <div className="flex flex-col gap-[18px] max-w-[720px]">
      <Card>
        <h3 className="text-[14px] font-bold mb-2">Сценарии</h3>
        <div className="flex flex-col gap-1.5">
          {(scenarios ?? []).map((s) => (
            <div key={s.id} className="text-[13px] flex items-center gap-2">
              <span className="font-semibold">{s.name || s.id}</span>
              {s.description && <span className="text-text-muted">— {s.description}</span>}
            </div>
          ))}
          {(scenarios ?? []).length === 0 && (
            <div className="text-[12px] text-text-muted">Сценарии не загружены.</div>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="text-[14px] font-bold mb-1">Правки скрипта</h3>
        <p className="text-[11.5px] text-text-muted mb-3">
          Реплики, которыми робот отвечает на конкретные фразы собеседника (настраиваются в рантайме).
        </p>

        <div className="grid grid-cols-[1fr_1fr_120px_auto] gap-2 mb-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-text-muted">Триггер (фраза собеседника)</label>
            <input value={trigger} onChange={(e) => setTrigger(e.target.value)}
              className="rounded-xl border border-[rgba(91,76,245,0.18)] p-2 text-[13px] outline-none" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-text-muted">Ответ робота</label>
            <input value={answer} onChange={(e) => setAnswer(e.target.value)}
              className="rounded-xl border border-[rgba(91,76,245,0.18)] p-2 text-[13px] outline-none" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-text-muted">Фаза</label>
            <select value={phase} onChange={(e) => setPhase(e.target.value)}
              className="rounded-xl border border-[rgba(91,76,245,0.18)] p-2 text-[13px] outline-none">
              <option value="any">любая</option>
              <option value="secretary">Секретарь</option>
              <option value="lpr_greeting">ЛПР (приветствие)</option>
              <option value="lpr_main">ЛПР</option>
              <option value="qualification">Квалификация</option>
            </select>
          </div>
          <Button onClick={handleAdd} disabled={addMut.isPending || !trigger.trim() || !answer.trim()}>
            {addMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Добавить
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          {(corrections ?? []).map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-[13px] p-2 rounded-xl bg-[rgba(91,76,245,0.04)]">
              <span className="font-semibold">{c.trigger}</span>
              <span className="text-text-muted">→ {c.correct_answer}</span>
              <span className="ml-auto text-[10px] text-text-muted">{c.phase}</span>
              <button onClick={() => delMut.mutate(c.id)} className="text-[#f44b6e] bg-transparent border-none cursor-pointer">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {(corrections ?? []).length === 0 && (
            <div className="text-[12px] text-text-muted">Правок пока нет.</div>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ---------- page ---------- */

/* ---------- Кампании обзвона ---------- */

const CAMP_STATUS: Record<Campaign["status"], { label: string; variant: "green" | "red" | "yellow" | "blue" | "gray" }> = {
  scheduled: { label: "Запланирована", variant: "blue" },
  running: { label: "Идёт обзвон", variant: "green" },
  waiting_window: { label: "Ожидает окна", variant: "yellow" },
  paused: { label: "Пауза", variant: "gray" },
  completed: { label: "Завершена", variant: "green" },
  cancelled: { label: "Отменена", variant: "gray" },
  failed: { label: "Ошибка", variant: "red" },
};

const ITEM_STATUS: Record<string, { label: string; variant: "green" | "red" | "yellow" | "blue" | "gray" }> = {
  pending: { label: "Ожидает", variant: "gray" },
  calling: { label: "Звоним…", variant: "blue" },
  done: { label: "Готово", variant: "green" },
  no_answer: { label: "Нет ответа", variant: "yellow" },
  failed: { label: "Ошибка", variant: "red" },
  cancelled: { label: "Отменён", variant: "gray" },
};

function campaignActions(status: Campaign["status"]): { label: string; action: "start" | "pause" | "resume" | "cancel" }[] {
  if (status === "scheduled") return [{ label: "Запустить", action: "start" }, { label: "Отменить", action: "cancel" }];
  if (status === "running" || status === "waiting_window") return [{ label: "Пауза", action: "pause" }, { label: "Стоп", action: "cancel" }];
  if (status === "paused") return [{ label: "Продолжить", action: "resume" }, { label: "Стоп", action: "cancel" }];
  return [];
}

function CampaignItemsTable({ campaignId }: { campaignId: string }) {
  const items = useCampaignItems(campaignId);
  const rows = items.data?.items ?? [];
  if (!rows.length) return <div className="text-[12px] text-text-muted py-2">Пока нет данных по звонкам.</div>;
  return (
    <table className="w-full text-left mt-2">
      <thead>
        <tr className="text-[11px] text-text-muted font-semibold uppercase tracking-wider">
          <th className="pb-2">Телефон</th>
          <th className="pb-2">Статус</th>
          <th className="pb-2">Итог</th>
          <th className="pb-2 text-right">Длит.</th>
          <th className="pb-2">Резюме</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((it) => {
          const st = ITEM_STATUS[it.status] ?? { label: it.status, variant: "gray" as const };
          return (
            <tr key={it.id} className="border-t border-[rgba(0,0,0,0.04)] text-[12.5px] align-top">
              <td className="py-[8px] font-medium">{it.phone}</td>
              <td className="py-[8px]"><Pill variant={st.variant}>{st.label}</Pill></td>
              <td className="py-[8px]">{it.outcome ?? "—"}</td>
              <td className="py-[8px] text-right">{it.duration_sec != null ? `${it.duration_sec}с` : "—"}</td>
              <td className="py-[8px] text-text-muted max-w-[320px]">{it.summary ?? "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CampaignsTab() {
  const segments = useSegments();
  const scenarios = useScenarios();
  const campaigns = useCampaigns();
  const create = useCreateCampaign();
  const control = useCampaignControl();

  const [name, setName] = useState("");
  const [segmentKey, setSegmentKey] = useState("");
  const [scenarioId, setScenarioId] = useState("default");
  const [maxConc, setMaxConc] = useState(1);
  const [scheduledAt, setScheduledAt] = useState("");
  const [winStart, setWinStart] = useState("09:00");
  const [winEnd, setWinEnd] = useState("20:00");
  const [openId, setOpenId] = useState<string | null>(null);

  const segItems = segments.data?.items ?? [];
  const scenItems = scenarios.data ?? [];
  const campItems = campaigns.data?.items ?? [];

  const submit = () => {
    if (!name.trim() || !segmentKey) return;
    create.mutate(
      {
        name: name.trim(),
        segment_key: segmentKey,
        scenario_id: scenarioId || "default",
        max_concurrent: maxConc,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        window_start: winStart || null,
        window_end: winEnd || null,
      },
      { onSuccess: () => setName("") },
    );
  };

  const field = "px-3 py-2 rounded-[9px] text-[13px] bg-white border border-[rgba(0,0,0,0.08)] outline-none";

  return (
    <div className="flex flex-col gap-[18px]">
      <Card>
        <h3 className="text-sm font-extrabold mb-3">Новая кампания обзвона</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-text-muted">
            Название
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Напр. Реактивация — гигиена" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-text-muted">
            Сегмент (аудитория)
            <select className={field} value={segmentKey} onChange={(e) => setSegmentKey(e.target.value)}>
              <option value="">— выберите сегмент —</option>
              {segItems.map((s) => (
                <option key={s.key} value={s.key}>{s.name} ({s.member_count})</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-text-muted">
            Сценарий
            <select className={field} value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
              {scenItems.length === 0 && <option value="default">default</option>}
              {scenItems.map((sc) => (
                <option key={sc.id} value={sc.id}>{sc.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-text-muted">
            Одновременных звонков
            <input className={field} type="number" min={1} value={maxConc} onChange={(e) => setMaxConc(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-text-muted">
            Старт (необязательно)
            <input className={field} type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </label>
          <div className="flex gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-text-muted flex-1">
              Окно с
              <input className={field} type="time" value={winStart} onChange={(e) => setWinStart(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-text-muted flex-1">
              Окно до
              <input className={field} type="time" value={winEnd} onChange={(e) => setWinEnd(e.target.value)} />
            </label>
          </div>
        </div>
        {create.error && (
          <div className="text-[12px] text-red-500 mt-2">{(create.error as any)?.response?.data?.detail ?? "Не удалось создать кампанию"}</div>
        )}
        <div className="mt-3">
          <Button onClick={submit} disabled={create.isPending || !name.trim() || !segmentKey}>
            {create.isPending ? "Создаём…" : "Создать кампанию"}
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-extrabold mb-3">Кампании</h3>
        {campItems.length === 0 && <div className="text-[12px] text-text-muted">Пока нет кампаний.</div>}
        <div className="flex flex-col gap-3">
          {campItems.map((c) => {
            const st = CAMP_STATUS[c.status] ?? { label: c.status, variant: "gray" as const };
            const actions = campaignActions(c.status);
            const open = openId === c.id;
            return (
              <div key={c.id} className="rounded-glass p-[14px_16px]" style={{ background: "rgba(255,255,255,0.55)" }}>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[13.5px]">{c.name}</span>
                      <Pill variant={st.variant}>{st.label}</Pill>
                    </div>
                    <div className="text-[11px] text-text-muted mt-[2px]">
                      {c.completed}/{c.total} · дозвон: {c.succeeded} · неудач: {c.failed}
                      {c.window_start && c.window_end ? ` · окно ${c.window_start}–${c.window_end}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {actions.map((a) => (
                      <Button key={a.action} variant={a.action === "cancel" ? "ghost" : "secondary"} size="sm"
                        onClick={() => control.mutate({ id: c.id, action: a.action })}>
                        {a.label}
                      </Button>
                    ))}
                    <Button variant="ghost" size="sm" onClick={() => setOpenId(open ? null : c.id)}>
                      {open ? "Скрыть" : "Результаты"}
                    </Button>
                  </div>
                </div>
                <div className="h-[5px] rounded-full overflow-hidden mt-2" style={{ background: "rgba(91,76,245,0.1)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${c.progress}%`, background: "linear-gradient(135deg,#5B4CF5,#3B7FED)" }} />
                </div>
                {open && <CampaignItemsTable campaignId={c.id} />}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export default function AiCalling() {
  const [tab, setTab] = useState<Tab>("dialog");
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex gap-[3px] p-1 rounded-xl bg-[rgba(91,76,245,0.07)] w-fit">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-[6px] rounded-[9px] text-[12.5px] font-semibold transition-all border-none ${
              tab === key
                ? "bg-white text-accent2 shadow-[0_2px_8px_rgba(91,76,245,0.15)]"
                : "text-text-muted bg-transparent cursor-pointer"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "dialog" && <DialogTab />}
      {tab === "tts" && <TtsTab />}
      {tab === "scripts" && <ScriptsTab />}
      {tab === "campaigns" && <CampaignsTab />}
    </div>
  );
}
