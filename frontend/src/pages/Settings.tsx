import { useState, useEffect, useRef, type ReactNode } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import {
  Save, KeyRound, Check, AlertCircle, Wifi, WifiOff, Loader2, Camera,
  Upload, Trash2, FileText, Info, Bot, Globe, Trophy, Star, Phone, RefreshCw,
} from "lucide-react";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import {
  useIntegrations,
  useSaveIntegrations,
  useCheckIntegration,
  useSyncOneDenta,
  useOneDentaSyncStatus,
  useKnowledgeBaseFiles,
  useUploadKbFile,
  useDeleteKbFile,
  type OneDentaSyncStatus,
} from "../api/integrations";
import { useRewardsConfig, useSaveRewardsConfig, useLeaderboard, type RewardsConfig } from "../api/rewards";
import { usePipelineStages } from "../api/pipelineStages";
import { GitBranch } from "lucide-react";

/* ---------- helpers ---------- */

function InputField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  readOnly,
  multiline,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  placeholder?: string;
  readOnly?: boolean;
  multiline?: boolean;
}) {
  const common = {
    value,
    onChange: onChange ? (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value) : undefined,
    placeholder,
    readOnly,
    className: "px-3 py-[9px] rounded-xl text-[13px] text-text-main bg-transparent outline-none transition-colors w-full resize-none",
    style: {
      border: "1px solid rgba(91,76,245,0.15)",
      background: readOnly ? "rgba(120,140,180,0.06)" : "rgba(255,255,255,0.5)",
      color: readOnly ? "#8a98b8" : undefined,
    } as React.CSSProperties,
  };
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
        {label}
      </label>
      {multiline ? (
        <textarea {...common} rows={3} />
      ) : (
        <input type={type} {...common} />
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer py-2">
      <span className="text-[13px] text-text-main font-medium">{label}</span>
      <div
        className="relative w-[42px] h-[24px] rounded-full transition-colors"
        style={{ background: checked ? "linear-gradient(135deg, #5B4CF5, #3B7FED)" : "rgba(0,0,0,0.12)" }}
        onClick={() => onChange(!checked)}
      >
        <div
          className="absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-transform shadow-sm"
          style={{ left: checked ? "21px" : "3px" }}
        />
      </div>
    </label>
  );
}

function StatusBanner({ success, error }: { success?: string; error?: string }) {
  if (!success && !error) return null;
  return (
    <div
      className="flex items-center gap-2 px-4 py-[10px] rounded-xl text-[12.5px] font-medium"
      style={{
        background: success ? "rgba(0,201,167,0.1)" : "rgba(244,75,110,0.1)",
        border: `1px solid ${success ? "rgba(0,201,167,0.25)" : "rgba(244,75,110,0.25)"}`,
        color: success ? "#007d6e" : "#c52048",
      }}
    >
      {success ? <Check size={14} /> : <AlertCircle size={14} />}
      {success ?? error}
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex gap-2 p-3 rounded-xl text-[12px] leading-relaxed"
      style={{ background: "rgba(91,76,245,0.07)", color: "#5B4CF5" }}
    >
      <Info size={14} className="flex-shrink-0 mt-[1px]" />
      <div>{children}</div>
    </div>
  );
}

/* ---------- Profile tab ---------- */

function ProfileTab() {
  const user = useAuthStore((s) => s.user);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdSuccess, setPwdSuccess] = useState("");
  const [pwdError, setPwdError] = useState("");

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setSuccess("");
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/auth/me/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      useAuthStore.setState((s) => ({
        user: s.user ? { ...s.user, avatar_url: data.avatar_url } : null,
      }));
      setSuccess("Фото обновлено");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Ошибка загрузки фото");
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSaveProfile() {
    setSaving(true);
    setSuccess("");
    setError("");
    try {
      const { data } = await api.put("/auth/me", { name, email });
      useAuthStore.setState((s) => ({ user: s.user ? { ...s.user, name: data.name, email: data.email } : null }));
      setSuccess("Профиль обновлён");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    setPwdSuccess("");
    setPwdError("");
    if (newPwd !== confirmPwd) { setPwdError("Пароли не совпадают"); return; }
    if (newPwd.length < 6) { setPwdError("Пароль должен быть не менее 6 символов"); return; }
    setPwdSaving(true);
    try {
      await api.post("/auth/change-password", { old_password: oldPwd, new_password: newPwd });
      setPwdSuccess("Пароль успешно изменён");
      setOldPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setPwdError(msg ?? "Ошибка смены пароля");
    } finally {
      setPwdSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <Card>
        <div className="flex items-center gap-3 mb-5">
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleAvatarUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            className="relative w-12 h-12 rounded-full flex-shrink-0 border-none cursor-pointer p-0 overflow-hidden group"
            title="Нажмите чтобы загрузить фото"
          >
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover rounded-full" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-[18px] font-bold" style={{ background: "linear-gradient(135deg,#5B4CF5,#3B7FED)" }}>
                {(user?.name ?? "?")[0].toUpperCase()}
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
              {avatarUploading ? <Loader2 size={16} className="text-white animate-spin" /> : <Camera size={16} className="text-white" />}
            </div>
          </button>
          <div>
            <div className="text-[15px] font-bold">{user?.name}</div>
            <div className="text-[12px] text-text-muted">{user?.role}</div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <InputField label="Имя" value={name} onChange={setName} />
          <InputField label="Email" value={email} onChange={setEmail} type="email" />
          <InputField label="Роль" value={user?.role ?? ""} readOnly />
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <StatusBanner success={success} error={error} />
          <div className="flex justify-end">
            <Button variant="primary" size="md" onClick={handleSaveProfile} disabled={saving}>
              <Save size={14} className="mr-2" />
              {saving ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-4">
          <KeyRound size={16} className="text-accent2" />
          <h2 className="text-[15px] font-bold">Смена пароля</h2>
        </div>
        <div className="flex flex-col gap-3">
          <InputField label="Текущий пароль" value={oldPwd} onChange={setOldPwd} type="password" placeholder="Введите текущий пароль" />
          <InputField label="Новый пароль" value={newPwd} onChange={setNewPwd} type="password" placeholder="Минимум 6 символов" />
          <InputField label="Подтвердите пароль" value={confirmPwd} onChange={setConfirmPwd} type="password" placeholder="Повторите новый пароль" />
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <StatusBanner success={pwdSuccess} error={pwdError} />
          <div className="flex justify-end">
            <Button variant="primary" size="md" onClick={handleChangePassword} disabled={pwdSaving || !oldPwd || !newPwd}>
              <KeyRound size={14} className="mr-2" />
              {pwdSaving ? "Изменение..." : "Изменить пароль"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ---------- Knowledge Base card ---------- */

function KnowledgeBaseCard() {
  const { data, isLoading, refetch } = useKnowledgeBaseFiles();
  const uploadMutation = useUploadKbFile();
  const deleteMutation = useDeleteKbFile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState("");

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    try {
      await uploadMutation.mutateAsync(file);
      refetch();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setUploadError(msg ?? "Ошибка загрузки файла");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    await deleteMutation.mutateAsync(id);
    refetch();
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Bot size={16} className="text-accent2" />
        <h3 className="text-[14px] font-bold text-text-main">База знаний бота</h3>
      </div>

      <InfoBox>
        Загрузите файлы (TXT, MD, PDF, DOCX) с информацией о клинике, прайс-листом, FAQ.
        AI-бот будет использовать эти материалы при ответах пациентам в Telegram и VK Max.
      </InfoBox>

      <div className="mt-3 flex flex-col gap-2">
        {isLoading && <div className="text-[12px] text-text-muted">Загрузка...</div>}
        {!isLoading && data?.files.length === 0 && (
          <div className="text-[12px] text-text-muted">Файлы не добавлены</div>
        )}
        {data?.files.map((f) => (
          <div
            key={f.id}
            className="flex items-center justify-between px-3 py-2 rounded-xl"
            style={{ background: "rgba(91,76,245,0.05)", border: "1px solid rgba(91,76,245,0.1)" }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={13} className="text-accent2 flex-shrink-0" />
              <span className="text-[12px] text-text-main truncate">{f.filename}</span>
              <span className="text-[11px] text-text-muted flex-shrink-0">{formatSize(f.size_bytes)}</span>
            </div>
            <button
              onClick={() => handleDelete(f.id)}
              disabled={deleteMutation.isPending}
              className="p-1 rounded-lg border-none bg-transparent cursor-pointer text-text-muted hover:text-red-500 transition-colors"
              title="Удалить"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      {uploadError && <div className="text-[12px] text-red-500 mt-2">{uploadError}</div>}

      <div className="mt-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.pdf,.docx"
          className="hidden"
          onChange={handleUpload}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-[7px] rounded-[9px] text-[12px] font-semibold border-none cursor-pointer transition-all"
          style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}
        >
          {uploadMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploadMutation.isPending ? "Загрузка..." : "Загрузить файл"}
        </button>
      </div>
    </Card>
  );
}

/* ---------- Integration card ---------- */

interface IntegrationField {
  key: string;
  label: string;
  type?: string;
  placeholder?: string;
  multiline?: boolean;
  isToggle?: boolean;
}

interface IntegrationCardConfig {
  service: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  fields: IntegrationField[];
  infoBox?: React.ReactNode;
}

const INTEGRATIONS: IntegrationCardConfig[] = [
  {
    service: "novofon",
    title: "Novofon (телефония)",
    description: "Звонки, записи разговоров, вебхуки",
    fields: [
      { key: "novofon_api_key", label: "API Key (Настройки → API → Ключ)", type: "password", placeholder: "Длинный буквенно-цифровой ключ" },
      { key: "novofon_webhook_secret", label: "API Secret (Настройки → API → Секрет)", type: "password", placeholder: "Секрет из раздела API (не appid_...)" },
    ],
  },
  {
    service: "one_denta",
    title: "1Denta (CRM)",
    description: "Синхронизация пациентов и записей",
    fields: [
      { key: "one_denta_api_url", label: "API URL", placeholder: "https://app3.sqns.ru" },
      { key: "one_denta_email", label: "Email", type: "email", placeholder: "email@clinic.ru" },
      { key: "one_denta_password", label: "Пароль", type: "password", placeholder: "Пароль" },
    ],
  },
  {
    service: "openai",
    title: "OpenAI",
    description: "ИИ-аналитика, подсказки, анализ скриптов, AI-бот",
    fields: [
      { key: "openai_api_key", label: "API Key", type: "password", placeholder: "sk-..." },
      { key: "openai_model", label: "Модель (чат, подсказки, инсайты)", placeholder: "gpt-4o" },
      { key: "segment_ai_model", label: "Модель для анализа базы (списки пациентов)", placeholder: "gpt-4o-mini" },
      { key: "segment_ai_concurrency", label: "Параллелизм анализа базы", type: "number", placeholder: "15" },
    ],
  },
  {
    service: "yandex_speechkit",
    title: "Yandex SpeechKit (ИИ обзвон)",
    icon: <Phone size={15} />,
    description: "Синтез речи (TTS) и распознавание для разделов «Тест TTS» и «Тест диалога»",
    infoBox: (
      <div className="flex flex-col gap-[6px] text-[12px]">
        <b>Где взять ключи:</b>
        <ol className="list-decimal list-inside space-y-1 text-text-muted">
          <li>Создайте сервисный аккаунт в <b>Yandex Cloud</b> с ролью <code>ai.speechkit-tts.user</code> (и при необходимости ASR)</li>
          <li>Создайте <b>API-ключ</b> для этого аккаунта и вставьте его ниже</li>
          <li>Скопируйте <b>Folder ID</b> (идентификатор каталога) из консоли Yandex Cloud</li>
        </ol>
        <div className="mt-1 text-text-muted">
          Классификация реплик в «Тест диалога» использует уже подключённый OpenAI (раздел выше).
        </div>
      </div>
    ),
    fields: [
      { key: "yandex_api_key", label: "API Key", type: "password", placeholder: "AQVN..." },
      { key: "yandex_folder_id", label: "Folder ID", placeholder: "b1g..." },
    ],
  },
  {
    service: "bots",
    title: "Настройки ботов (общие)",
    icon: <Bot size={15} />,
    description: "Приветственное сообщение и название клиники — одинаковые для Telegram и Max",
    fields: [
      { key: "bot_clinic_name", label: "Название клиники (для ботов)", placeholder: "Стоматология Арт Смайл" },
      { key: "bot_welcome_message", label: "Приветственное сообщение (оставьте пустым для стандартного)", multiline: true, placeholder: "👋 Добро пожаловать! Я AI-ассистент клиники..." },
    ],
  },
  {
    service: "telegram",
    title: "Telegram",
    icon: <Bot size={15} />,
    description: "AI-бот для записи пациентов и консультаций",
    infoBox: (
      <div className="flex flex-col gap-[6px] text-[12px]">
        <b>Инструкция подключения:</b>
        <ol className="list-decimal list-inside space-y-1 text-text-muted">
          <li>Создайте бота у <b>@BotFather</b> командой <code>/newbot</code></li>
          <li>Скопируйте Bot Token и вставьте ниже</li>
          <li>Укажите Webhook Secret (любая случайная строка)</li>
          <li>Зарегистрируйте вебхук: <code>curl -X POST https://api.telegram.org/bot&lt;TOKEN&gt;/setWebhook -d "url=https://ВАШ_ДОМЕН/api/v1/webhooks/telegram?secret=&lt;SECRET&gt;"</code></li>
          <li>Включите «AI-ответы» — бот запустится с приветствием и меню</li>
        </ol>
        <div className="mt-1 text-text-muted">
          Бот показывает меню «Записаться / Задать вопрос», ведёт по шагам выбора услуги, даты и времени.
        </div>
      </div>
    ),
    fields: [
      { key: "telegram_bot_token", label: "Bot Token", type: "password", placeholder: "123456:ABC..." },
      { key: "telegram_webhook_secret", label: "Webhook Secret", type: "password", placeholder: "Секрет для setWebhook" },
      { key: "telegram_owner_chat_id", label: "Chat ID владельца (для ежедневных отчётов)", placeholder: "123456789" },
      { key: "telegram_bot_ai_enabled", label: "AI-ответы включены", isToggle: true },
      { key: "telegram_bot_system_prompt", label: "Системный промпт (оставьте пустым для стандартного)", multiline: true, placeholder: "Ты — ассистент клиники..." },
    ],
  },
  {
    service: "max_vk",
    title: "Мессенджер Max",
    icon: <Bot size={15} />,
    description: "AI-бот для записи пациентов в мессенджере Max (max.ru)",
    infoBox: (
      <div className="flex flex-col gap-[6px] text-[12px]">
        <b>Инструкция подключения бота в мессенджере Max:</b>
        <ol className="list-decimal list-inside space-y-1 text-text-muted">
          <li>Откройте мессенджер Max → найдите <b>@MaxBotAPI</b> → создайте бота командой <code>/newbot</code></li>
          <li>Получите <b>токен бота</b> и вставьте его ниже</li>
          <li>Нажмите <b>«Сохранить все»</b> — webhook зарегистрируется автоматически</li>
          <li>Включите «AI-ответы» — бот запустится с приветствием и меню</li>
          <li>Загрузите файлы в <b>«Базу знаний бота»</b> выше — прайс, FAQ, описание услуг</li>
        </ol>
        <div className="mt-1 text-text-muted">
          Бот показывает меню «Записаться / Задать вопрос», помогает выбрать услугу, дату и время — и передаёт запись в систему.
        </div>
      </div>
    ),
    fields: [
      { key: "max_bot_token", label: "Токен бота (из @MaxBotAPI)", type: "password", placeholder: "Токен вида eyJ..." },
      { key: "max_bot_ai_enabled", label: "AI-ответы включены", isToggle: true },
      { key: "max_bot_system_prompt", label: "Системный промпт (оставьте пустым для стандартного)", multiline: true, placeholder: "Ты — ассистент клиники..." },
    ],
  },
  {
    service: "site",
    title: "Форма на сайте / Тильда",
    icon: <Globe size={15} />,
    description: "Webhook для приёма заявок с сайта и Тильды",
    infoBox: (
      <div className="flex flex-col gap-[6px] text-[12px]">
        <b>Как подключить форму Тильды:</b>
        <ol className="list-decimal list-inside space-y-1 text-text-muted">
          <li>Откройте форму на Тильде → Настройки формы → <b>После отправки</b></li>
          <li>Выберите <b>Webhook</b> и укажите URL:<br/>
            <code className="text-[11px] break-all">https://ВАШ_ДОМЕН/api/v1/webhooks/site</code>
          </li>
          <li>Тильда автоматически отправит поля: <b>Name, Phone, Email, Comment</b></li>
          <li>Заявки появятся в разделе «Коммуникации» со статусом <b>Новый</b></li>
        </ol>
        <div className="mt-1 text-text-muted">
          <b>Поддерживаемые форматы:</b> JSON и form-data (Тильда использует form-data по умолчанию).
          Поля распознаются автоматически (Name/name, Phone/phone, Email/email, Comment/message).
        </div>
      </div>
    ),
    fields: [
      { key: "site_webhook_url", label: "Ваш Webhook URL (для справки)", placeholder: "https://dentaflow.ru/api/v1/webhooks/site" },
      { key: "tilda_secret", label: "Tilda Secret (необязательно, для подписи HMAC)", type: "password", placeholder: "Секретный ключ" },
    ],
  },
  {
    service: "mail",
    title: "Почта (Mail.ru)",
    description: "SMTP для отправки email-уведомлений",
    fields: [
      { key: "mail_host", label: "SMTP-сервер", placeholder: "smtp.mail.ru" },
      { key: "mail_port", label: "Порт", placeholder: "465" },
      { key: "mail_user", label: "Email", type: "email", placeholder: "clinic@mail.ru" },
      { key: "mail_password", label: "Пароль", type: "password", placeholder: "Пароль приложения" },
    ],
  },
];

function IntegrationCard({
  config,
  values,
  onChange,
  onCheck,
  checkResult,
  checking,
  onSync,
  syncing,
  syncStatus,
  syncInfo,
}: {
  config: IntegrationCardConfig;
  values: Record<string, string>;
  onChange: (key: string, val: string) => void;
  onCheck: () => void;
  checkResult: { ok: boolean; message: string } | null;
  checking: boolean;
  onSync?: () => void;
  syncing?: boolean;
  syncStatus?: string;
  syncInfo?: ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {config.icon && <span className="text-accent2">{config.icon}</span>}
          <div>
            <h3 className="text-[14px] font-bold text-text-main">{config.title}</h3>
            <p className="text-[11.5px] text-text-muted mt-[2px]">{config.description}</p>
          </div>
        </div>
        {checkResult && (
          <div className="flex items-center gap-1.5">
            {checkResult.ok ? <Wifi size={14} className="text-[#00c9a7]" /> : <WifiOff size={14} className="text-[#f44b6e]" />}
            <span className="text-[11px] font-semibold" style={{ color: checkResult.ok ? "#00c9a7" : "#f44b6e" }}>
              {checkResult.message}
            </span>
          </div>
        )}
      </div>

      {config.infoBox && (
        <div
          className="mb-3 p-3 rounded-xl text-[12px]"
          style={{ background: "rgba(91,76,245,0.06)", border: "1px solid rgba(91,76,245,0.12)" }}
        >
          {config.infoBox}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {config.fields.map((f) =>
          f.isToggle ? (
            <Toggle
              key={f.key}
              label={f.label}
              checked={values[f.key] === "true"}
              onChange={(v) => onChange(f.key, v ? "true" : "false")}
            />
          ) : (
            <InputField
              key={f.key}
              label={f.label}
              value={values[f.key] ?? ""}
              onChange={(v) => onChange(f.key, v)}
              type={f.type}
              placeholder={f.placeholder}
              multiline={f.multiline}
            />
          )
        )}
      </div>

      {syncInfo && (
        <div
          className="mt-3 p-3 rounded-xl text-[12px]"
          style={{ background: "rgba(91,76,245,0.06)", border: "1px solid rgba(91,76,245,0.12)" }}
        >
          {syncInfo}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 mt-3">
        {syncStatus && (
          <span className="text-[11px] font-semibold text-[#00c9a7] mr-auto">{syncStatus}</span>
        )}
        {onSync && (
          <button
            onClick={onSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-[6px] rounded-[9px] text-[12px] font-semibold border-none cursor-pointer transition-all disabled:opacity-50"
            style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}
          >
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Запуск..." : "Синхронизировать"}
          </button>
        )}
        <button
          onClick={onCheck}
          disabled={checking}
          className="flex items-center gap-1.5 px-3 py-[6px] rounded-[9px] text-[12px] font-semibold border-none cursor-pointer transition-all"
          style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}
        >
          {checking ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
          {checking ? "Проверка..." : "Проверить"}
        </button>
      </div>
    </Card>
  );
}

/* ---------- Auto-lead card ---------- */

const LEAD_CHANNELS: { key: string; label: string }[] = [
  { key: "site", label: "Сайт" },
  { key: "novofon", label: "Телефония" },
  { key: "telegram", label: "Telegram" },
  { key: "max", label: "Max/VK" },
];

function AutoLeadCard({
  values,
  onChange,
}: {
  values: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  const { data: stages } = usePipelineStages();
  const enabled = values["auto_lead_enabled"] === "true";
  const selected = (values["auto_lead_channels"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allSelected = LEAD_CHANNELS.every((c) => selected.includes(c.key));

  function toggleChannel(key: string) {
    const set = new Set(selected);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    onChange("auto_lead_channels", Array.from(set).join(","));
  }

  function toggleAll() {
    if (allSelected) onChange("auto_lead_channels", "");
    else onChange("auto_lead_channels", LEAD_CHANNELS.map((c) => c.key).join(","));
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <GitBranch size={16} className="text-accent2" />
        <div>
          <h3 className="text-[14px] font-bold text-text-main">Автосоздание лидов из заявок</h3>
          <p className="text-[11.5px] text-text-muted mt-[2px]">Заявки из выбранных каналов автоматически попадают в воронку CRM</p>
        </div>
      </div>

      <Toggle
        label="Автоматически создавать лиды в воронке"
        checked={enabled}
        onChange={(v) => onChange("auto_lead_enabled", v ? "true" : "")}
      />

      {enabled && (
        <div className="flex flex-col gap-3 mt-2">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Этап воронки для новых лидов</label>
            <select
              value={values["auto_lead_stage"] ?? "new"}
              onChange={(e) => onChange("auto_lead_stage", e.target.value)}
              className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none w-full cursor-pointer"
              style={{ border: "1px solid rgba(91,76,245,0.15)", background: "rgba(255,255,255,0.5)" }}
            >
              {(stages ?? []).map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Каналы</label>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 cursor-pointer text-[13px] font-semibold text-text-main">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-[#5B4CF5] w-4 h-4" />
                Все каналы
              </label>
              {LEAD_CHANNELS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 cursor-pointer text-[13px] text-text-main pl-4">
                  <input
                    type="checkbox"
                    checked={selected.includes(c.key)}
                    onChange={() => toggleChannel(c.key)}
                    className="accent-[#5B4CF5] w-4 h-4"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------- 1Denta sync status ---------- */

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "d MMM, HH:mm", { locale: ru });
  } catch {
    return "—";
  }
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { locale: ru, addSuffix: true });
  } catch {
    return "";
  }
}

function OneDentaSyncInfo({ status }: { status: OneDentaSyncStatus | undefined }) {
  if (!status || !status.last_sync_at) {
    return (
      <div className="text-text-muted">
        Синхронизация ещё не выполнялась. Данные обновляются автоматически раз в час.
      </div>
    );
  }

  const r = status.result;
  const dirCount = r?.directories
    ? Object.values(r.directories).reduce((s, n) => s + (Number(n) || 0), 0)
    : null;
  const pat = r?.patients;
  const appt = r?.appointments;

  const summaryParts: string[] = [];
  if (dirCount !== null) summaryParts.push(`справочники ${dirCount}`);
  if (pat) summaryParts.push(`пациенты +${pat.created ?? 0}/~${pat.updated ?? 0}`);
  if (appt) summaryParts.push(`записи +${appt.created ?? 0}/~${appt.updated ?? 0}`);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <RefreshCw size={12} className="text-accent2 flex-shrink-0" />
        <span className="text-text-main font-semibold">
          Последняя синхронизация: {fmtRelative(status.last_sync_at)}
        </span>
        <span className="text-text-muted">({fmtDateTime(status.last_sync_at)})</span>
        {status.ok === false && (
          <span className="text-[#f44b6e] font-semibold">— с ошибкой</span>
        )}
      </div>
      <div className="text-text-muted">
        Следующая ≈ {fmtDateTime(status.next_sync_at)}
      </div>
      <div className="text-text-muted">
        Синхронизировано: {summaryParts.length ? summaryParts.join(" · ") : "—"}
      </div>
    </div>
  );
}

/* ---------- Integrations tab ---------- */

function IntegrationsTab() {
  const { data: saved, isLoading } = useIntegrations();
  const saveMutation = useSaveIntegrations();
  const checkMutation = useCheckIntegration();
  const syncOneDenta = useSyncOneDenta();
  const { data: oneDentaStatus } = useOneDentaSyncStatus();
  const isOwner = useAuthStore((s) => s.user?.role) === "owner";

  const [values, setValues] = useState<Record<string, string>>({});
  const [checkResults, setCheckResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [checkingService, setCheckingService] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (saved) setValues(saved);
  }, [saved]);

  function handleChange(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    setSaveSuccess("");
    setSaveError("");
    try {
      await saveMutation.mutateAsync(values);
      setSaveSuccess("Настройки сохранены");
    } catch {
      setSaveError("Ошибка при сохранении");
    }
  }

  async function handleCheck(service: string) {
    setCheckingService(service);
    try {
      const result = await checkMutation.mutateAsync(service);
      setCheckResults((prev) => ({ ...prev, [service]: result }));
    } catch {
      setCheckResults((prev) => ({ ...prev, [service]: { ok: false, message: "Ошибка сети" } }));
    } finally {
      setCheckingService(null);
    }
  }

  async function handleSyncOneDenta() {
    setSyncStatus("");
    try {
      await syncOneDenta.mutateAsync();
      setSyncStatus("Синхронизация запущена — данные обновятся в течение нескольких минут");
    } catch {
      setSyncStatus("Не удалось запустить синхронизацию");
    }
  }

  if (isLoading) {
    return <div className="text-center text-text-muted py-8 text-[13px]">Загрузка настроек...</div>;
  }

  return (
    <div className="flex flex-col gap-[14px]">
      <AutoLeadCard values={values} onChange={handleChange} />

      <KnowledgeBaseCard />

      {INTEGRATIONS.map((cfg) => {
        // Единая ручная синхронизация с 1Denta — только у владельца.
        // Остальная синхронизация происходит автоматически раз в час.
        const isOneDenta = cfg.service === "one_denta";
        const showSync = isOneDenta && isOwner;
        return (
          <IntegrationCard
            key={cfg.service}
            config={cfg}
            values={values}
            onChange={handleChange}
            onCheck={() => handleCheck(cfg.service)}
            checkResult={checkResults[cfg.service] ?? null}
            checking={checkingService === cfg.service}
            onSync={showSync ? handleSyncOneDenta : undefined}
            syncing={showSync && syncOneDenta.isPending}
            syncStatus={showSync ? syncStatus : undefined}
            syncInfo={isOneDenta ? <OneDentaSyncInfo status={oneDentaStatus} /> : undefined}
          />
        );
      })}

      <div className="flex flex-col gap-3">
        <StatusBanner success={saveSuccess} error={saveError} />
        <div className="flex justify-end">
          <Button variant="primary" size="md" onClick={handleSave} disabled={saveMutation.isPending}>
            <Save size={14} className="mr-2" />
            {saveMutation.isPending ? "Сохранение..." : "Сохранить все"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Motivation tab ---------- */

const ACTION_LABELS: Record<string, string> = {
  task_completed: "Выполнение задачи звонка",
  call_made: "Совершение звонка",
  script_compliance: "Соответствие скрипту (оценка QC)",
  appointment_confirmed: "Подтверждение записи",
  patient_reached: "Пациент взял трубку",
};

function MotivationTab() {
  const { data: config, isLoading } = useRewardsConfig();
  const { data: leaderboard } = useLeaderboard();
  const saveMutation = useSaveRewardsConfig();

  const [values, setValues] = useState<RewardsConfig>({
    task_completed: 10,
    call_made: 5,
    script_compliance: 15,
    appointment_confirmed: 20,
    patient_reached: 8,
  });
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (config) setValues(config);
  }, [config]);

  async function handleSave() {
    setSaveSuccess("");
    setSaveError("");
    try {
      await saveMutation.mutateAsync(values);
      setSaveSuccess("Настройки сохранены");
    } catch {
      setSaveError("Ошибка при сохранении");
    }
  }

  if (isLoading) {
    return <div className="text-center text-text-muted py-8 text-[13px]">Загрузка...</div>;
  }

  const getMedalStyle = (rank: number) => {
    if (rank === 1) return { color: "#f5a623", label: "🥇" };
    if (rank === 2) return { color: "#8a98b8", label: "🥈" };
    if (rank === 3) return { color: "#b07050", label: "🥉" };
    return { color: "#8a98b8", label: `${rank}` };
  };

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Points configuration card */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Star size={16} className="text-[#f5a623]" />
          <h2 className="text-[15px] font-bold text-text-main">Система баллов для администраторов</h2>
        </div>
        <div
          className="mb-4 p-3 rounded-xl text-[12px] leading-relaxed"
          style={{ background: "rgba(91,76,245,0.06)", color: "#5B4CF5" }}
        >
          <Info size={13} className="inline mr-1 mb-0.5" />
          Настройте количество баллов за каждое действие администратора. Баллы начисляются автоматически и формируют рейтинг сотрудников.
        </div>
        <div className="flex flex-col gap-3">
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <label className="text-[13px] text-text-main font-medium flex-1">{label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={values[key as keyof RewardsConfig] ?? 0}
                  onChange={(e) => setValues((prev) => ({ ...prev, [key]: Number(e.target.value) } as RewardsConfig))}
                  className="w-[80px] px-3 py-[7px] rounded-[10px] text-[13px] text-text-main text-center outline-none"
                  style={{ border: "1px solid rgba(91,76,245,0.18)", background: "rgba(255,255,255,0.7)" }}
                />
                <span className="text-[12px] text-text-muted w-[36px]">балл.</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-col gap-3">
          <StatusBanner success={saveSuccess} error={saveError} />
          <div className="flex justify-end">
            <Button variant="primary" size="md" onClick={handleSave} disabled={saveMutation.isPending}>
              <Save size={14} className="mr-2" />
              {saveMutation.isPending ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Leaderboard preview */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={16} className="text-[#f5a623]" />
          <h2 className="text-[15px] font-bold text-text-main">Текущий рейтинг администраторов</h2>
        </div>
        {!leaderboard || leaderboard.items.length === 0 ? (
          <div className="text-[13px] text-text-muted py-4 text-center">
            Баллы ещё не начислялись. Рейтинг появится после первых выполненных задач.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {leaderboard.items.map((entry) => {
              const medal = getMedalStyle(entry.rank);
              return (
                <div
                  key={entry.user_id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{ background: entry.rank <= 3 ? "rgba(245,166,35,0.05)" : "rgba(91,76,245,0.04)", border: "1px solid rgba(91,76,245,0.08)" }}
                >
                  <span className="text-[18px] w-8 text-center flex-shrink-0">{medal.label}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-text-main truncate">{entry.name}</div>
                    <div className="text-[11px] text-text-muted">задач выполнено: {entry.tasks_completed}</div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Star size={13} className="text-[#f5a623]" />
                    <span className="text-[14px] font-bold text-text-main">{entry.total_points}</span>
                    <span className="text-[11px] text-text-muted">балл.</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- component ---------- */

type Tab = "profile" | "clinic" | "integrations" | "notifications" | "motivation";

const TABS: { key: Tab; label: string }[] = [
  { key: "profile", label: "Профиль" },
  { key: "clinic", label: "Клиника" },
  { key: "integrations", label: "Интеграции" },
  { key: "notifications", label: "Уведомления" },
  { key: "motivation", label: "Мотивация" },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  const [clinic, setClinic] = useState({
    name: "Стоматология «Улыбка»",
    address: "г. Москва, ул. Ленина, д. 42",
    phone: "+7 (495) 123-45-67",
  });

  const [notifications, setNotifications] = useState({
    emailNewLead: true,
    emailNoShow: true,
    telegramNewLead: true,
    telegramNoShow: false,
    telegramDailySummary: true,
    emailWeeklyReport: true,
  });

  return (
    <div className="flex flex-col gap-[18px] max-w-[800px]">
      <div className="flex gap-[3px] p-1 rounded-xl bg-[rgba(91,76,245,0.07)] w-fit">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-[6px] rounded-[9px] text-[12.5px] font-semibold transition-all border-none ${
              activeTab === key
                ? "bg-white text-accent2 shadow-[0_2px_8px_rgba(91,76,245,0.15)]"
                : "text-text-muted bg-transparent cursor-pointer"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "profile" && <ProfileTab />}

      {activeTab === "clinic" && (
        <Card>
          <h2 className="text-[15px] font-bold text-text-main mb-4">Клиника</h2>
          <div className="flex flex-col gap-3">
            <InputField label="Название" value={clinic.name} onChange={(v) => setClinic((p) => ({ ...p, name: v }))} />
            <InputField label="Адрес" value={clinic.address} onChange={(v) => setClinic((p) => ({ ...p, address: v }))} />
            <InputField label="Телефон" value={clinic.phone} onChange={(v) => setClinic((p) => ({ ...p, phone: v }))} type="tel" />
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="primary" size="md">
              <Save size={14} className="mr-2" />
              Сохранить
            </Button>
          </div>
        </Card>
      )}

      {activeTab === "integrations" && <IntegrationsTab />}

      {activeTab === "motivation" && <MotivationTab />}

      {activeTab === "notifications" && (
        <Card>
          <h2 className="text-[15px] font-bold text-text-main mb-4">Уведомления</h2>
          <div className="flex flex-col">
            <div className="text-[12px] text-text-muted font-bold uppercase tracking-wider mb-2">Email</div>
            <Toggle label="Новый лид" checked={notifications.emailNewLead} onChange={(v) => setNotifications((p) => ({ ...p, emailNewLead: v }))} />
            <Toggle label="Неявка пациента" checked={notifications.emailNoShow} onChange={(v) => setNotifications((p) => ({ ...p, emailNoShow: v }))} />
            <Toggle label="Еженедельный отчёт" checked={notifications.emailWeeklyReport} onChange={(v) => setNotifications((p) => ({ ...p, emailWeeklyReport: v }))} />
            <div className="text-[12px] text-text-muted font-bold uppercase tracking-wider mb-2 mt-4">Telegram</div>
            <Toggle label="Новый лид" checked={notifications.telegramNewLead} onChange={(v) => setNotifications((p) => ({ ...p, telegramNewLead: v }))} />
            <Toggle label="Неявка пациента" checked={notifications.telegramNoShow} onChange={(v) => setNotifications((p) => ({ ...p, telegramNoShow: v }))} />
            <Toggle label="Ежедневная сводка" checked={notifications.telegramDailySummary} onChange={(v) => setNotifications((p) => ({ ...p, telegramDailySummary: v }))} />
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="primary" size="md">
              <Save size={14} className="mr-2" />
              Сохранить
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
