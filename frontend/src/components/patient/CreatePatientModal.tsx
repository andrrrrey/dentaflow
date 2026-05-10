import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { X, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useCreatePatient, type PatientCreatePayload } from "../../api/patients";

interface Props {
  onClose: () => void;
}

const inputCls = "px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none w-full";
const inputStyle = {
  border: "1px solid rgba(91,76,245,0.15)",
  background: "rgba(255,255,255,0.5)",
};
const labelCls = "text-[10.5px] font-bold text-text-muted uppercase tracking-wider";

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-[14px] overflow-hidden" style={{ borderColor: "rgba(91,76,245,0.12)" }}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ background: "rgba(91,76,245,0.04)" }}
      >
        <span className="text-[13px] font-bold text-text-main">{title}</span>
        {open ? <ChevronUp size={15} className="text-text-muted" /> : <ChevronDown size={15} className="text-text-muted" />}
      </button>
      {open && <div className="px-4 py-4 flex flex-col gap-3">{children}</div>}
    </div>
  );
}

const CHANNELS: [string, string][] = [
  ["", "Не указан"],
  ["telegram", "Telegram"],
  ["call", "Звонок"],
  ["site", "Сайт"],
  ["max", "Max / VK"],
  ["referral", "Реферал"],
];

export default function CreatePatientModal({ onClose }: Props) {
  const navigate = useNavigate();
  const createMutation = useCreatePatient();

  const [lastname, setLastname] = useState("");
  const [firstname, setFirstname] = useState("");
  const [patronymic, setPatronymic] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [gender, setGender] = useState<"" | "male" | "female">("");
  const [comment, setComment] = useState("");

  const [phone, setPhone] = useState("");
  const [additionalPhone, setAdditionalPhone] = useState("");
  const [showAdditionalPhone, setShowAdditionalPhone] = useState(false);
  const [email, setEmail] = useState("");

  const [snils, setSnils] = useState("");
  const [oms, setOms] = useState("");
  const [omsIssueDate, setOmsIssueDate] = useState("");
  const [omsOrgCode, setOmsOrgCode] = useState("");
  const [inn, setInn] = useState("");

  const [citizenship, setCitizenship] = useState("");
  const [passportSerial, setPassportSerial] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [passportIssueDate, setPassportIssueDate] = useState("");
  const [passportIssuedBy, setPassportIssuedBy] = useState("");
  const [passportDeptCode, setPassportDeptCode] = useState("");

  const [address, setAddress] = useState("");
  const [sourceChannel, setSourceChannel] = useState("");
  const [pushTo1denta, setPushTo1denta] = useState(true);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    main: true,
    contacts: true,
    docs: false,
    passport: false,
    address: false,
  });
  const [error, setError] = useState("");

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function buildName() {
    return [lastname, firstname, patronymic].filter(Boolean).join(" ").trim();
  }

  async function handleSubmit() {
    const name = buildName();
    if (!name) {
      setError("Введите хотя бы имя пациента");
      return;
    }
    setError("");

    const payload: PatientCreatePayload = {
      name,
      lastname: lastname || undefined,
      firstname: firstname || undefined,
      patronymic: patronymic || undefined,
      gender: gender || undefined,
      comment: comment || undefined,
      phone: phone || undefined,
      additional_phone: additionalPhone || undefined,
      email: email || undefined,
      snils: snils || undefined,
      inn: inn || undefined,
      oms: oms || undefined,
      oms_issue_date: omsIssueDate || undefined,
      oms_org_code: omsOrgCode || undefined,
      citizenship: citizenship || undefined,
      passport_serial: passportSerial || undefined,
      passport_number: passportNumber || undefined,
      passport_issue_date: passportIssueDate || undefined,
      passport_issued_by: passportIssuedBy || undefined,
      passport_department_code: passportDeptCode || undefined,
      address: address || undefined,
      source_channel: sourceChannel || undefined,
      push_to_1denta: pushTo1denta,
    };

    // Compose birth_date from parts
    if (birthDay && birthYear) {
      const [dayStr, monthStr] = birthDay.split(".");
      if (dayStr && monthStr && birthYear.length === 4) {
        payload.birth_date = `${birthYear}-${monthStr.padStart(2, "0")}-${dayStr.padStart(2, "0")}`;
      }
    }

    try {
      const result = await createMutation.mutateAsync(payload);
      if (result.warning) {
        // Пациент создан, но не передан в 1Denta — сообщим и откроем карту
        alert(`Пациент создан, но не передан в 1Denta:\n${result.warning}`);
      }
      onClose();
      navigate(`/patients/${result.id}`);
    } catch {
      setError("Не удалось создать пациента. Попробуйте ещё раз.");
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] rounded-[20px] flex flex-col mx-4"
        style={{
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(24px)",
          boxShadow: "0 8px 40px rgba(91,76,245,0.18)",
          maxHeight: "90vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "rgba(91,76,245,0.10)" }}>
          <h2 className="text-[16px] font-bold text-text-main">Новый пациент</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-main border-none bg-transparent cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex flex-col gap-3 px-6 py-4" style={{ flex: 1 }}>

          {/* ── Основные данные ── */}
          <Section title="Основные данные" open={openSections.main} onToggle={() => toggleSection("main")}>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Фамилия</label>
                <input value={lastname} onChange={(e) => setLastname(e.target.value)} className={inputCls} style={inputStyle} placeholder="Фамилия" />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Имя *</label>
                <input value={firstname} onChange={(e) => setFirstname(e.target.value)} className={inputCls} style={inputStyle} placeholder="Имя" />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Отчество</label>
                <input value={patronymic} onChange={(e) => setPatronymic(e.target.value)} className={inputCls} style={inputStyle} placeholder="Отчество" />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelCls}>Дата рождения</label>
              <div className="flex gap-2">
                <input
                  value={birthDay}
                  onChange={(e) => setBirthDay(e.target.value)}
                  className={inputCls}
                  style={{ ...inputStyle, maxWidth: 110 }}
                  placeholder="дд.мм"
                />
                <input
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  className={inputCls}
                  style={{ ...inputStyle, maxWidth: 80 }}
                  placeholder="гггг"
                  maxLength={4}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Пол</label>
              <div className="flex gap-2">
                {(["", "male", "female"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setGender(v)}
                    className="px-3 py-[7px] rounded-xl text-[12px] font-semibold border cursor-pointer transition-colors"
                    style={{
                      background: gender === v ? "rgba(91,76,245,0.12)" : "rgba(255,255,255,0.5)",
                      borderColor: gender === v ? "rgba(91,76,245,0.4)" : "rgba(91,76,245,0.15)",
                      color: gender === v ? "#5B4CF5" : "#6b7280",
                    }}
                  >
                    {v === "" ? "Не указано" : v === "male" ? "Мужской" : "Женский"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelCls}>Примечание к пациенту</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="px-3 py-2 rounded-xl text-[13px] text-text-main outline-none resize-none w-full"
                style={inputStyle}
                placeholder="Примечание..."
              />
            </div>
          </Section>

          {/* ── Контакты ── */}
          <Section title="Контакты" open={openSections.contacts} onToggle={() => toggleSection("contacts")}>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Телефон</label>
              <div className="flex gap-2 items-center">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} style={inputStyle} placeholder="+7 (999) 123-45-67" />
                {!showAdditionalPhone && (
                  <button
                    type="button"
                    onClick={() => setShowAdditionalPhone(true)}
                    className="flex items-center gap-1 text-[12px] text-[#5B4CF5] whitespace-nowrap border-none bg-transparent cursor-pointer font-semibold"
                  >
                    <Plus size={13} /> Телефон
                  </button>
                )}
              </div>
            </div>
            {showAdditionalPhone && (
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Дополнительный телефон</label>
                <input value={additionalPhone} onChange={(e) => setAdditionalPhone(e.target.value)} className={inputCls} style={inputStyle} placeholder="+7 (999) 000-00-00" />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className={labelCls}>E-mail</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} style={inputStyle} placeholder="email@example.com" type="email" />
            </div>
          </Section>

          {/* ── Документы ── */}
          <Section title="Документы" open={openSections.docs} onToggle={() => toggleSection("docs")}>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Полис ОМС</label>
              <input value={oms} onChange={(e) => setOms(e.target.value)} className={inputCls} style={inputStyle} placeholder="Номер полиса ОМС" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Дата выдачи полиса ОМС</label>
                <input value={omsIssueDate} onChange={(e) => setOmsIssueDate(e.target.value)} className={inputCls} style={inputStyle} placeholder="дд.мм.гггг" />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Код организации</label>
                <input value={omsOrgCode} onChange={(e) => setOmsOrgCode(e.target.value)} className={inputCls} style={inputStyle} placeholder="Код" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>СНИЛС</label>
              <input value={snils} onChange={(e) => setSnils(e.target.value)} className={inputCls} style={inputStyle} placeholder="000-000-000 00" />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>ИНН Пациента</label>
              <input value={inn} onChange={(e) => setInn(e.target.value)} className={inputCls} style={inputStyle} placeholder="ИНН" maxLength={12} />
            </div>
          </Section>

          {/* ── Удостоверение личности ── */}
          <Section title="Удостоверение личности" open={openSections.passport} onToggle={() => toggleSection("passport")}>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Гражданство</label>
              <input value={citizenship} onChange={(e) => setCitizenship(e.target.value)} className={inputCls} style={inputStyle} placeholder="Гражданство" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Серия</label>
                <input value={passportSerial} onChange={(e) => setPassportSerial(e.target.value)} className={inputCls} style={inputStyle} placeholder="0000" maxLength={4} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Номер</label>
                <input value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} className={inputCls} style={inputStyle} placeholder="000000" maxLength={6} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Дата выдачи</label>
              <input value={passportIssueDate} onChange={(e) => setPassportIssueDate(e.target.value)} className={inputCls} style={inputStyle} placeholder="дд.мм.гггг" />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Кем выдан</label>
              <textarea
                value={passportIssuedBy}
                onChange={(e) => setPassportIssuedBy(e.target.value)}
                rows={2}
                className="px-3 py-2 rounded-xl text-[13px] text-text-main outline-none resize-none w-full"
                style={inputStyle}
                placeholder="Наименование органа, выдавшего документ"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Код подразделения</label>
              <input value={passportDeptCode} onChange={(e) => setPassportDeptCode(e.target.value)} className={inputCls} style={inputStyle} placeholder="000-000" maxLength={7} />
            </div>
          </Section>

          {/* ── Адрес ── */}
          <Section title="Адрес" open={openSections.address} onToggle={() => toggleSection("address")}>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Адрес</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} style={inputStyle} placeholder="Город, улица, дом, квартира" />
            </div>
          </Section>

          {/* Источник и передача */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Источник</label>
              <select
                value={sourceChannel}
                onChange={(e) => setSourceChannel(e.target.value)}
                className={inputCls}
                style={inputStyle}
              >
                {CHANNELS.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 justify-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pushTo1denta}
                  onChange={(e) => setPushTo1denta(e.target.checked)}
                  className="w-4 h-4 accent-[#5B4CF5]"
                />
                <span className="text-[12px] text-text-main font-semibold">Передать в 1Denta</span>
              </label>
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-xl text-[12px] text-red-600 font-medium" style={{ background: "rgba(220,38,38,0.08)" }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t"
          style={{ borderColor: "rgba(91,76,245,0.10)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-[9px] rounded-xl text-[13px] font-semibold border cursor-pointer transition-colors"
            style={{ borderColor: "rgba(91,76,245,0.2)", color: "#5B4CF5", background: "transparent" }}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="px-5 py-[9px] rounded-xl text-[13px] font-semibold cursor-pointer transition-colors disabled:opacity-60"
            style={{ background: "#5B4CF5", color: "#fff", border: "none" }}
          >
            {createMutation.isPending ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
