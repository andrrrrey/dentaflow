import { useState } from "react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { Save, KeyRound, Check, AlertCircle } from "lucide-react";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";

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

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdSuccess, setPwdSuccess] = useState("");
  const [pwdError, setPwdError] = useState("");

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
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[18px] font-bold flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#5B4CF5,#3B7FED)" }}
          >
            {(user?.name ?? "?")[0].toUpperCase()}
          </div>
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

  const [integrations, setIntegrations] = useState({
    dentaApiKey: "sk-****************************3f2a",
    novofon: "nf-****************************8b1c",
    telegramBot: "bot****************************:AAF",
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

      {activeTab === "integrations" && (
        <Card>
          <h2 className="text-[15px] font-bold text-text-main mb-4">Интеграции</h2>
          <div className="flex flex-col gap-3">
            <InputField label="1Denta API Key" value={integrations.dentaApiKey} onChange={(v) => setIntegrations((p) => ({ ...p, dentaApiKey: v }))} type="password" placeholder="sk-..." />
            <InputField label="Novofon API Key" value={integrations.novofon} onChange={(v) => setIntegrations((p) => ({ ...p, novofon: v }))} type="password" placeholder="nf-..." />
            <InputField label="Telegram Bot Token" value={integrations.telegramBot} onChange={(v) => setIntegrations((p) => ({ ...p, telegramBot: v }))} type="password" placeholder="bot...:AAF..." />
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="primary" size="md">
              <Save size={14} className="mr-2" />
              Сохранить
            </Button>
          </div>
        </Card>
      )}

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
