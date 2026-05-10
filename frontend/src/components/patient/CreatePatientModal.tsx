import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { X, ChevronDown, ChevronUp, Plus, AlertCircle } from "lucide-react";
import { useCreatePatient, type PatientCreatePayload } from "../../api/patients";

interface Props {
  onClose: () => void;
  prefillName?: string;
  prefillPhone?: string;
}

const inp = "px-3 py-[9px] rounded-[10px] text-[13px] text-text-main outline-none w-full";
const inpStyle = {
  border: "1px solid rgba(91,76,245,0.18)",
  background: "rgba(255,255,255,0.7)",
};
const lbl = "block text-[10.5px] font-bold text-text-muted uppercase tracking-wider mb-1";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      {children}
    </div>
  );
}

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
    <div
      className="rounded-[14px] overflow-hidden"
      style={{ border: "1px solid rgba(91,76,245,0.10)" }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-[11px] text-left cursor-pointer border-none"
        style={{ background: open ? "rgba(91,76,245,0.06)" : "rgba(247,247,252,0.9)" }}
      >
        <span className="text-[13px] font-bold text-text-main">{title}</span>
        {open
          ? <ChevronUp size={15} className="text-accent2" />
          : <ChevronDown size={15} className="text-text-muted" />}
      </button>
      {open && (
        <div
          className="px-5 py-4 flex flex-col gap-4"
          style={{ background: "rgba(255,255,255,0.6)" }}
        >
          {children}
        </div>
      )}
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

export default function CreatePatientModal({ onClose, prefillName = "", prefillPhone = "" }: Props) {
  const navigate = useNavigate();
  const createMutation = useCreatePatient();

  // Split prefillName into parts if provided
  const nameParts = prefillName.trim().split(/\s+/);
  const [lastname, setLastname] = useState(nameParts[0] ?? "");
  const [firstname, setFirstname] = useState(nameParts[1] ?? "");
  const [patronymic, setPatronymic] = useState(nameParts[2] ?? "");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<"" | "male" | "female">("");
  const [comment, setComment] = useState("");

  const [phone, setPhone] = useState(prefillPhone);
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

  const [open, setOpen] = useState({
    main: true,
    contacts: true,
    docs: false,
    passport: false,
    address: false,
  });
  const [error, setError] = useState("");

  function toggle(key: keyof typeof open) {
    setOpen((p) => ({ ...p, [key]: !p[key] }));
  }

  async function handleSubmit() {
    const name = [lastname, firstname, patronymic].filter(Boolean).join(" ").trim();
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
      birth_date: birthDate || undefined,
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

    try {
      const result = await createMutation.mutateAsync(payload);
      if (result.warning) {
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
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/40 overflow-y-auto py-6 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[760px] rounded-[22px] flex flex-col"
        style={{
          background: "rgba(248,248,254,0.99)",
          backdropFilter: "blur(24px)",
          boxShadow: "0 16px 64px rgba(91,76,245,0.20), 0 2px 8px rgba(0,0,0,0.06)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-7 py-5"
          style={{ borderBottom: "1px solid rgba(91,76,245,0.10)" }}
        >
          <div>
            <h2 className="text-[18px] font-bold text-text-main">Новый пациент</h2>
            <p className="text-[12px] text-text-muted mt-0.5">Медицинская карта пациента</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-text-main hover:bg-[rgba(91,76,245,0.06)] border-none bg-transparent cursor-pointer transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-col gap-3 px-7 py-5">

          {/* ── Основные данные ── */}
          <Section title="Основные данные" open={open.main} onToggle={() => toggle("main")}>
            {/* ФИО row */}
            <div className="grid grid-cols-3 gap-3">
              <Field label="Фамилия">
                <input
                  value={lastname}
                  onChange={(e) => setLastname(e.target.value)}
                  className={inp}
                  style={inpStyle}
                  placeholder="Фамилия"
                />
              </Field>
              <Field label="Имя *">
                <input
                  value={firstname}
                  onChange={(e) => setFirstname(e.target.value)}
                  className={inp}
                  style={inpStyle}
                  placeholder="Имя"
                />
              </Field>
              <Field label="Отчество">
                <input
                  value={patronymic}
                  onChange={(e) => setPatronymic(e.target.value)}
                  className={inp}
                  style={inpStyle}
                  placeholder="Отчество"
                />
              </Field>
            </div>

            {/* Date + gender row */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Дата рождения">
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className={inp}
                  style={inpStyle}
                />
              </Field>
              <Field label="Пол">
                <div className="flex gap-2 h-[38px] items-center">
                  {(["", "male", "female"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setGender(v)}
                      className="flex-1 py-[8px] rounded-[10px] text-[12px] font-semibold border cursor-pointer transition-all"
                      style={{
                        background: gender === v ? "rgba(91,76,245,0.12)" : "rgba(255,255,255,0.6)",
                        borderColor: gender === v ? "rgba(91,76,245,0.45)" : "rgba(91,76,245,0.15)",
                        color: gender === v ? "#5B4CF5" : "#6b7280",
                      }}
                    >
                      {v === "" ? "Не указано" : v === "male" ? "Мужской" : "Женский"}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            <Field label="Примечание к пациенту">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="px-3 py-2 rounded-[10px] text-[13px] text-text-main outline-none resize-none w-full"
                style={inpStyle}
                placeholder="Примечание..."
              />
            </Field>
          </Section>

          {/* ── Контакты ── */}
          <Section title="Контакты" open={open.contacts} onToggle={() => toggle("contacts")}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Телефон</label>
                <div className="flex gap-2 items-center">
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={inp}
                    style={inpStyle}
                    placeholder="+7 (999) 123-45-67"
                  />
                  {!showAdditionalPhone && (
                    <button
                      type="button"
                      onClick={() => setShowAdditionalPhone(true)}
                      className="flex-shrink-0 flex items-center gap-1 text-[12px] text-accent2 font-semibold border-none bg-transparent cursor-pointer whitespace-nowrap"
                    >
                      <Plus size={13} /> ещё
                    </button>
                  )}
                </div>
                {showAdditionalPhone && (
                  <input
                    value={additionalPhone}
                    onChange={(e) => setAdditionalPhone(e.target.value)}
                    className={`${inp} mt-2`}
                    style={inpStyle}
                    placeholder="Дополнительный телефон"
                  />
                )}
              </div>
              <Field label="E-mail">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inp}
                  style={inpStyle}
                  placeholder="email@example.com"
                  type="email"
                />
              </Field>
            </div>
          </Section>

          {/* ── Документы ── */}
          <Section title="Документы" open={open.docs} onToggle={() => toggle("docs")}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="СНИЛС">
                <input
                  value={snils}
                  onChange={(e) => setSnils(e.target.value)}
                  className={inp}
                  style={inpStyle}
                  placeholder="000-000-000 00"
                />
              </Field>
              <Field label="ИНН Пациента">
                <input
                  value={inn}
                  onChange={(e) => setInn(e.target.value)}
                  className={inp}
                  style={inpStyle}
                  placeholder="ИНН"
                  maxLength={12}
                />
              </Field>
            </div>
            <Field label="Полис ОМС">
              <input
                value={oms}
                onChange={(e) => setOms(e.target.value)}
                className={inp}
                style={inpStyle}
                placeholder="Номер полиса ОМС"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Дата выдачи полиса ОМС">
                <input
                  type="date"
                  value={omsIssueDate}
                  onChange={(e) => setOmsIssueDate(e.target.value)}
                  className={inp}
                  style={inpStyle}
                />
              </Field>
              <Field label="Код организации">
                <input
                  value={omsOrgCode}
                  onChange={(e) => setOmsOrgCode(e.target.value)}
                  className={inp}
                  style={inpStyle}
                  placeholder="Код"
                />
              </Field>
            </div>
          </Section>

          {/* ── Удостоверение личности ── */}
          <Section title="Удостоверение личности" open={open.passport} onToggle={() => toggle("passport")}>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Гражданство">
                <input
                  value={citizenship}
                  onChange={(e) => setCitizenship(e.target.value)}
                  className={inp}
                  style={inpStyle}
                  placeholder="Гражданство"
                />
              </Field>
              <Field label="Серия">
                <input
                  value={passportSerial}
                  onChange={(e) => setPassportSerial(e.target.value)}
                  className={inp}
                  style={inpStyle}
                  placeholder="0000"
                  maxLength={4}
                />
              </Field>
              <Field label="Номер">
                <input
                  value={passportNumber}
                  onChange={(e) => setPassportNumber(e.target.value)}
                  className={inp}
                  style={inpStyle}
                  placeholder="000000"
                  maxLength={6}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Дата выдачи">
                <input
                  type="date"
                  value={passportIssueDate}
                  onChange={(e) => setPassportIssueDate(e.target.value)}
                  className={inp}
                  style={inpStyle}
                />
              </Field>
              <Field label="Код подразделения">
                <input
                  value={passportDeptCode}
                  onChange={(e) => setPassportDeptCode(e.target.value)}
                  className={inp}
                  style={inpStyle}
                  placeholder="000-000"
                  maxLength={7}
                />
              </Field>
            </div>
            <Field label="Кем выдан">
              <textarea
                value={passportIssuedBy}
                onChange={(e) => setPassportIssuedBy(e.target.value)}
                rows={2}
                className="px-3 py-2 rounded-[10px] text-[13px] text-text-main outline-none resize-none w-full"
                style={inpStyle}
                placeholder="Наименование органа, выдавшего документ"
              />
            </Field>
          </Section>

          {/* ── Адрес ── */}
          <Section title="Адрес" open={open.address} onToggle={() => toggle("address")}>
            <Field label="Адрес">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={inp}
                style={inpStyle}
                placeholder="Город, улица, дом, квартира"
              />
            </Field>
          </Section>

          {/* ── Источник + 1Denta ── */}
          <div
            className="rounded-[14px] px-5 py-4 flex items-center gap-6"
            style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(91,76,245,0.10)" }}
          >
            <div className="flex-1">
              <label className={lbl}>Источник</label>
              <select
                value={sourceChannel}
                onChange={(e) => setSourceChannel(e.target.value)}
                className={inp}
                style={inpStyle}
              >
                {CHANNELS.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer mt-4">
              <input
                type="checkbox"
                checked={pushTo1denta}
                onChange={(e) => setPushTo1denta(e.target.checked)}
                className="w-[15px] h-[15px] accent-[#5B4CF5]"
              />
              <span className="text-[13px] text-text-main font-semibold">Передать в 1Denta</span>
            </label>
          </div>

          {/* Error */}
          {error && (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-[12px] text-[12.5px] text-red-600 font-medium"
              style={{ background: "rgba(220,38,38,0.07)" }}
            >
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          className="flex items-center justify-end gap-3 px-7 py-4"
          style={{ borderTop: "1px solid rgba(91,76,245,0.10)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-[10px] rounded-[12px] text-[13px] font-semibold cursor-pointer transition-colors border"
            style={{ borderColor: "rgba(91,76,245,0.2)", color: "#5B4CF5", background: "transparent" }}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="px-6 py-[10px] rounded-[12px] text-[13px] font-bold cursor-pointer transition-all disabled:opacity-60 border-none"
            style={{ background: "linear-gradient(135deg, #5B4CF5, #3B7FED)", color: "#fff", boxShadow: "0 4px 14px rgba(91,76,245,0.30)" }}
          >
            {createMutation.isPending ? "Сохранение..." : "Сохранить пациента"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
