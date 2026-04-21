import { useState } from "react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { Save } from "lucide-react";

/* ---------- helpers ---------- */

function InputField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-[9px] rounded-xl text-[13px] text-text-main bg-transparent outline-none transition-colors"
        style={{
          border: "1px solid rgba(91,76,245,0.15)",
          background: "rgba(255,255,255,0.5)",
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
          style={{
            left: checked ? "21px" : "3px",
          }}
        />
      </div>
    </label>
  );
}

/* ---------- component ---------- */

export default function Settings() {
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
      {/* Clinic settings */}
      <Card>
        <h2 className="text-[15px] font-bold text-text-main mb-4">Клиника</h2>
        <div className="flex flex-col gap-3">
          <InputField
            label="Название"
            value={clinic.name}
            onChange={(v) => setClinic((p) => ({ ...p, name: v }))}
          />
          <InputField
            label="Адрес"
            value={clinic.address}
            onChange={(v) => setClinic((p) => ({ ...p, address: v }))}
          />
          <InputField
            label="Телефон"
            value={clinic.phone}
            onChange={(v) => setClinic((p) => ({ ...p, phone: v }))}
            type="tel"
          />
        </div>
      </Card>

      {/* Integrations */}
      <Card>
        <h2 className="text-[15px] font-bold text-text-main mb-4">Интеграции</h2>
        <div className="flex flex-col gap-3">
          <InputField
            label="1Denta API Key"
            value={integrations.dentaApiKey}
            onChange={(v) => setIntegrations((p) => ({ ...p, dentaApiKey: v }))}
            type="password"
            placeholder="sk-..."
          />
          <InputField
            label="Novofon API Key"
            value={integrations.novofon}
            onChange={(v) => setIntegrations((p) => ({ ...p, novofon: v }))}
            type="password"
            placeholder="nf-..."
          />
          <InputField
            label="Telegram Bot Token"
            value={integrations.telegramBot}
            onChange={(v) => setIntegrations((p) => ({ ...p, telegramBot: v }))}
            type="password"
            placeholder="bot...:AAF..."
          />
        </div>
      </Card>

      {/* Notifications */}
      <Card>
        <h2 className="text-[15px] font-bold text-text-main mb-4">Уведомления</h2>
        <div className="flex flex-col">
          <div className="text-[12px] text-text-muted font-bold uppercase tracking-wider mb-2">
            Email
          </div>
          <Toggle
            label="Новый лид"
            checked={notifications.emailNewLead}
            onChange={(v) => setNotifications((p) => ({ ...p, emailNewLead: v }))}
          />
          <Toggle
            label="Неявка пациента"
            checked={notifications.emailNoShow}
            onChange={(v) => setNotifications((p) => ({ ...p, emailNoShow: v }))}
          />
          <Toggle
            label="Еженедельный отчёт"
            checked={notifications.emailWeeklyReport}
            onChange={(v) => setNotifications((p) => ({ ...p, emailWeeklyReport: v }))}
          />

          <div className="text-[12px] text-text-muted font-bold uppercase tracking-wider mb-2 mt-4">
            Telegram
          </div>
          <Toggle
            label="Новый лид"
            checked={notifications.telegramNewLead}
            onChange={(v) => setNotifications((p) => ({ ...p, telegramNewLead: v }))}
          />
          <Toggle
            label="Неявка пациента"
            checked={notifications.telegramNoShow}
            onChange={(v) => setNotifications((p) => ({ ...p, telegramNoShow: v }))}
          />
          <Toggle
            label="Ежедневная сводка"
            checked={notifications.telegramDailySummary}
            onChange={(v) => setNotifications((p) => ({ ...p, telegramDailySummary: v }))}
          />
        </div>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button variant="primary" size="md">
          <Save size={14} className="mr-2" />
          Сохранить настройки
        </Button>
      </div>
    </div>
  );
}
