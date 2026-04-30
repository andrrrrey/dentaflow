import { useState } from "react";
import { Plus, Pencil, Trash2, X, Users, UserCheck } from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Pill from "../components/ui/Pill";
import StatCard from "../components/ui/StatCard";
import { useStaff, useCreateStaff, useUpdateStaff, useDeleteStaff } from "../api/staff";
import type { StaffMember, StaffCreate, StaffUpdate } from "../api/staff";

/* ---------- helpers ---------- */

const roleConfig: Record<string, { label: string; variant: "purple" | "blue" | "green" | "yellow" | "gray" }> = {
  owner:    { label: "Владелец",      variant: "purple" },
  manager:  { label: "Управляющий",   variant: "blue" },
  admin:    { label: "Администратор", variant: "green" },
  marketer: { label: "Маркетолог",    variant: "yellow" },
};

const ROLES = ["owner", "manager", "admin", "marketer"];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
        {label}{required && <span className="text-[#F44B6E] ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-[9px] rounded-xl text-[13px] text-text-main bg-transparent outline-none transition-colors"
        style={{ border: "1px solid rgba(91,76,245,0.15)", background: "rgba(255,255,255,0.5)" }}
      />
    </div>
  );
}

/* ---------- modal ---------- */

interface ModalProps {
  member?: StaffMember;
  onClose: () => void;
}

function StaffModal({ member, onClose }: ModalProps) {
  const createMutation = useCreateStaff();
  const updateMutation = useUpdateStaff();

  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [role, setRole] = useState(member?.role ?? "admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const isEdit = Boolean(member);

  async function handleSubmit() {
    setError("");
    if (!name.trim() || !email.trim()) {
      setError("Заполните обязательные поля");
      return;
    }
    if (!isEdit && !password.trim()) {
      setError("Укажите пароль для нового сотрудника");
      return;
    }
    try {
      if (isEdit && member) {
        const upd: StaffUpdate & { id: string } = { id: member.id, name, email, role };
        await updateMutation.mutateAsync(upd);
      } else {
        const body: StaffCreate = { name, email, role, password };
        await createMutation.mutateAsync(body);
      }
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Ошибка при сохранении");
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-[420px] mx-4 rounded-2xl p-6 flex flex-col gap-4"
        style={{
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "blur(24px)",
          boxShadow: "0 20px 60px rgba(91,76,245,0.18)",
          border: "1px solid rgba(255,255,255,0.9)",
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold">
            {isEdit ? "Редактировать сотрудника" : "Добавить сотрудника"}
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-main border-none bg-transparent cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <InputField label="Имя" value={name} onChange={setName} placeholder="Фамилия Имя Отчество" required />
        <InputField label="Email" value={email} onChange={setEmail} type="email" placeholder="user@clinic.ru" required />

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Роль<span className="text-[#F44B6E] ml-0.5">*</span></label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="px-3 py-[9px] rounded-xl text-[13px] text-text-main outline-none cursor-pointer"
            style={{ border: "1px solid rgba(91,76,245,0.15)", background: "rgba(255,255,255,0.5)" }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{roleConfig[r]?.label ?? r}</option>
            ))}
          </select>
        </div>

        {!isEdit && (
          <InputField label="Пароль" value={password} onChange={setPassword} type="password" placeholder="Минимум 6 символов" required />
        )}

        {error && (
          <div className="text-[12px] text-[#F44B6E] px-3 py-2 rounded-xl bg-[rgba(244,75,110,0.08)] border border-[rgba(244,75,110,0.2)]">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end mt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>Отмена</Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>
            {saving ? "Сохранение..." : isEdit ? "Сохранить" : "Добавить"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- component ---------- */

export default function Staff() {
  const { data, isLoading } = useStaff();
  const deleteMutation = useDeleteStaff();

  const [modalMember, setModalMember] = useState<StaffMember | undefined>(undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const members = data?.staff ?? [];
  const admins = members.filter((m) => m.role === "admin").length;

  function openCreate() {
    setModalMember(undefined);
    setModalOpen(true);
  }

  function openEdit(m: StaffMember) {
    setModalMember(m);
    setModalOpen(true);
  }

  async function handleDelete(id: string) {
    await deleteMutation.mutateAsync(id);
    setDeleteConfirm(null);
  }

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">
        <StatCard label="Всего сотрудников" value={String(data?.total ?? 0)} icon={<Users size={18} className="text-accent2" />} />
        <StatCard label="Администраторов" value={String(admins)} icon={<UserCheck size={18} className="text-accent3" />} />
      </div>

      {/* Table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold">Сотрудники</h2>
          <Button variant="primary" size="sm" onClick={openCreate}>
            <Plus size={14} className="mr-1" />
            Добавить
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center text-text-muted py-10 text-[13px]">Загрузка данных...</div>
        ) : members.length === 0 ? (
          <div className="text-center text-text-muted py-10 text-[13px]">Нет сотрудников</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Сотрудник", "Роль", "Email", "Статус", "Действия"].map((h) => (
                    <th
                      key={h}
                      className="text-left text-[10.5px] font-bold text-text-muted uppercase tracking-[0.8px] pb-[10px] px-[12px]"
                      style={{ borderBottom: "1px solid rgba(91,76,245,0.08)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const cfg = roleConfig[m.role] ?? { label: m.role, variant: "gray" as const };
                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-[rgba(91,76,245,0.03)]"
                      style={{ borderBottom: "1px solid rgba(91,76,245,0.05)" }}
                    >
                      <td className="py-[10px] px-[12px]">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                            style={{ background: "linear-gradient(135deg,#5B4CF5,#3B7FED)" }}
                          >
                            {getInitials(m.name)}
                          </div>
                          <span className="text-[13px] font-semibold">{m.name}</span>
                        </div>
                      </td>
                      <td className="py-[10px] px-[12px]">
                        <Pill variant={cfg.variant}>{cfg.label}</Pill>
                      </td>
                      <td className="py-[10px] px-[12px] text-[12.5px] text-text-muted">{m.email}</td>
                      <td className="py-[10px] px-[12px]">
                        <Pill variant={m.is_active ? "green" : "gray"}>
                          {m.is_active ? "Активен" : "Отключён"}
                        </Pill>
                      </td>
                      <td className="py-[10px] px-[12px]">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(m)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-accent2 hover:bg-[rgba(91,76,245,0.08)] border-none bg-transparent cursor-pointer transition-colors"
                            title="Редактировать"
                          >
                            <Pencil size={13} />
                          </button>
                          {deleteConfirm === m.id ? (
                            <div className="flex items-center gap-1 ml-1">
                              <button
                                onClick={() => handleDelete(m.id)}
                                className="text-[11px] font-semibold text-white bg-[#F44B6E] px-2 py-[3px] rounded-lg border-none cursor-pointer"
                                disabled={deleteMutation.isPending}
                              >
                                Удалить
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="text-[11px] text-text-muted px-2 py-[3px] rounded-lg border border-[rgba(91,76,245,0.15)] bg-transparent cursor-pointer"
                              >
                                Отмена
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(m.id)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-[#F44B6E] hover:bg-[rgba(244,75,110,0.08)] border-none bg-transparent cursor-pointer transition-colors"
                              title="Удалить"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal */}
      {modalOpen && (
        <StaffModal
          member={modalMember}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
