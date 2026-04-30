import { useState, useEffect, useRef } from "react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { Save, KeyRound, Check, AlertCircle, Wifi, WifiOff, Loader2, Camera } from "lucide-react";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useIntegrations, useSaveIntegrations, useCheckIntegration } from "../api/integrations";

/* ---------- helpers ---------- */

function InputField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  readOnly,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  placeholder?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        placeholder={placeholder}
        readOnly={readOnly}
        className="px-3 py-[9px] rounded-xl text-[13px] text-text-main bg-transparent outline-none transition-colors"
        style={{
          border: "1px solid rgba(91,76,245,0.15)",
          background: readOnly ? "rgba(120,140,180,0.06)" : "rgba(255,255,255,0.5)",
          color: readOnly ? "#8a98b8" : undefined,
        }}
      />
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
        style={{
          background: checked
            ? "linear-gradient(135deg, #5B4CF5, #3B7FED)"
            : "rgba(0,0,0,0.12)",
        }}
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
    if (newPwd !== confirmPwd) {
      setPwdError("Пароли не совпадают");
      return;
    }
    if (newPwd.length < 6) {
      setPwdError("Пароль должен быть не менее 6 символов");
      return;
    }
    setPwdSaving(true);
    try {
      await api.post("/auth/change-password", {
        old_password: oldPwd,
        new_password: newPwd,
      });
      setPwdSuccess("Пароль успешно изменён");
      setOldPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setPwdError(msg ?? "Ошибка смены пароля");
    } finally {
      setPwdSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Profile info */}
      <Card>
        <div className="flex items-center gap-3 mb-5">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleAvatarUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            className="relative w-12 h-12 rounded-full flex-shrink-0 border-none cursor-pointer p-0 overflow-hidden group"
            title="Нажмите чтобы загрузить фото"
          >
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name}
                className="w-full h-full object-cover rounded-full"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-white text-[18px] font-bold"
                style={{ background: "linear-gradient(135deg,#5B4CF5,#3B7FED)" }}
              >
                {(user?.name ?? "?")[0].toUpperCase()}
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
              {avatarUploading ? (
                <Loader2 size={16} className="text-white animate-spin" />
              ) : (
                <Camera size={16} className="text-white" />
              )}
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

      {/* Password change */}
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

/* ---------- Integration card ---------- */

interface IntegrationField {
  key: string;
  label: string;
  type?: string;
  placeholder?: string;
}

interface IntegrationCardConfig {
  service: string;
  title: string;
  description: string;
  fields: IntegrationField[];
}

const INTEGRATIONS: IntegrationCardConfig[] = [
  {
    service: "novofon",
    title: "Novofon (телефония)",
    description: "Звонки, записи разговоров, вебхуки",
    fields: [
      { key: "novofon_api_key", label: "API Key (appid_...)", type: "password", placeholder: "appid_XXXXXXX" },
      { key: "novofon_webhook_secret", label: "API Secret (из кабинета Novofon → API → Secret)", type: "password", placeholder: "Secret из личного кабинета" },
    ],
  },
  {
    service: "one_denta",
    title: "1Denta (CRM)",
    description: "Синхронизация пациентов и записей",
    fields: [
      { key: "one_denta_api_url", label: "API URL", placeholder: "https://crmexchange.1denta.ru" },
      { key: "one_denta_email", label: "Email", type: "email", placeholder: "email@clinic.ru" },
      { key: "one_denta_password", label: "Пароль", type: "password", placeholder: "Пароль" },
    ],
  },
  {
    service: "openai",
    title: "OpenAI",
    description: "ИИ-аналитика, подсказки, анализ скриптов",
    fields: [
      { key: "openai_api_key", label: "API Key", type: "password", placeholder: "sk-..." },
      { key: "openai_model", label: "Модель", placeholder: "gpt-4o" },
    ],
  },
  {
    service: "telegram",
    title: "Telegram",
    description: "Бот для уведомлений и приёма сообщений",
    fields: [
      { key: "telegram_bot_token", label: "Bot Token", type: "password", placeholder: "123456:ABC..." },
      { key: "telegram_webhook_secret", label: "Webhook Secret", type: "password", placeholder: "Секрет" },
      { key: "telegram_owner_chat_id", label: "Chat ID владельца", placeholder: "123456789" },
    ],
  },
  {
    service: "max_vk",
    title: "MAX / VK",
    description: "Сообщения из VK-сообщества",
    fields: [
      { key: "max_api_key", label: "Access Token", type: "password", placeholder: "vk1.a.XXX..." },
      { key: "max_confirmation_token", label: "Confirmation Token", type: "password", placeholder: "Токен подтверждения" },
    ],
  },
  {
    service: "site",
    title: "Форма на сайте",
    description: "Webhook для приёма заявок с сайта",
    fields: [
      { key: "site_webhook_url", label: "Webhook URL", placeholder: "https://dentaflow.ru/api/v1/webhooks/site" },
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
}: {
  config: IntegrationCardConfig;
  values: Record<string, string>;
  onChange: (key: string, val: string) => void;
  onCheck: () => void;
  checkResult: { ok: boolean; message: string } | null;
  checking: boolean;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-[14px] font-bold text-text-main">{config.title}</h3>
          <p className="text-[11.5px] text-text-muted mt-[2px]">{config.description}</p>
        </div>
        {checkResult && (
          <div className="flex items-center gap-1.5">
            {checkResult.ok ? (
              <Wifi size={14} className="text-[#00c9a7]" />
            ) : (
              <WifiOff size={14} className="text-[#f44b6e]" />
            )}
            <span
              className="text-[11px] font-semibold"
              style={{ color: checkResult.ok ? "#00c9a7" : "#f44b6e" }}
            >
              {checkResult.message}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {config.fields.map((f) => (
          <InputField
            key={f.key}
            label={f.label}
            value={values[f.key] ?? ""}
            onChange={(v) => onChange(f.key, v)}
            type={f.type}
            placeholder={f.placeholder}
          />
        ))}
      </div>

      <div className="flex justify-end mt-3">
        <button
          onClick={onCheck}
          disabled={checking}
          className="flex items-center gap-1.5 px-3 py-[6px] rounded-[9px] text-[12px] font-semibold border-none cursor-pointer transition-all"
          style={{
            background: "rgba(91,76,245,0.08)",
            color: "#5B4CF5",
          }}
        >
          {checking ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
          {checking ? "Проверка..." : "Проверить"}
        </button>
      </div>
    </Card>
  );
}

/* ---------- Integrations tab ---------- */

function IntegrationsTab() {
  const { data: saved, isLoading } = useIntegrations();
  const saveMutation = useSaveIntegrations();
  const checkMutation = useCheckIntegration();

  const [values, setValues] = useState<Record<string, string>>({});
  const [checkResults, setCheckResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [checkingService, setCheckingService] = useState<string | null>(null);
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

  if (isLoading) {
    return <div className="text-center text-text-muted py-8 text-[13px]">Загрузка настроек...</div>;
  }

  return (
    <div className="flex flex-col gap-[14px]">
      {INTEGRATIONS.map((cfg) => (
        <IntegrationCard
          key={cfg.service}
          config={cfg}
          values={values}
          onChange={handleChange}
          onCheck={() => handleCheck(cfg.service)}
          checkResult={checkResults[cfg.service] ?? null}
          checking={checkingService === cfg.service}
        />
      ))}

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

/* ---------- component ---------- */

type Tab = "profile" | "clinic" | "integrations" | "notifications";

const TABS: { key: Tab; label: string }[] = [
  { key: "profile", label: "Профиль" },
  { key: "clinic", label: "Клиника" },
  { key: "integrations", label: "Интеграции" },
  { key: "notifications", label: "Уведомления" },
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
      {/* Tab bar */}
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
