import { useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { CheckCircle2, Circle, Clock, Phone, CalendarCheck, RefreshCw, AlertTriangle, Plus, X } from "lucide-react";
import Pill from "../components/ui/Pill";
import Button from "../components/ui/Button";
import { useTasks, useCreateTask, useToggleTask } from "../api/tasks";

const typeIcon: Record<string, React.ReactNode> = {
  callback: <Phone size={14} className="text-[#3B7FED]" />,
  followup: <RefreshCw size={14} className="text-[#F5A623]" />,
  confirm_appointment: <CalendarCheck size={14} className="text-[#00C9A7]" />,
};

const typeLabel: Record<string, string> = {
  callback: "Перезвонить",
  followup: "Напоминание",
  confirm_appointment: "Подтвердить визит",
  other: "Другое",
};

export default function Tasks() {
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "callback", title: "", due_at: "" });

  const { data, isLoading } = useTasks(
    filter === "active" ? { is_done: false } : filter === "done" ? { is_done: true } : undefined
  );
  const createTask = useCreateTask();
  const toggleTask = useToggleTask();

  const tasks = data?.items ?? [];
  const now = new Date();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.due_at) return;
    createTask.mutate(
      {
        type: form.type,
        title: form.title.trim(),
        due_at: new Date(form.due_at).toISOString(),
        patient_id: null,
      },
      {
        onSuccess: () => {
          setForm({ type: "callback", title: "", due_at: "" });
          setShowForm(false);
        },
      }
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {/* Filter tabs */}
          {(["all", "active", "done"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
                filter === f
                  ? "bg-accent2 text-white"
                  : "bg-[rgba(91,76,245,0.08)] text-text-muted hover:bg-[rgba(91,76,245,0.14)]"
              }`}
            >
              {f === "all" ? "Все" : f === "active" ? "Активные" : "Выполненные"}
            </button>
          ))}
          {data && data.overdue_count > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-[#f44b6e]">
              <AlertTriangle size={12} />
              {data.overdue_count} просрочено
            </span>
          )}
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus size={14} className="mr-1.5" />
          Новая задача
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <div
          className="rounded-[16px] p-[16px_18px]"
          style={{
            background: "rgba(255,255,255,0.75)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.85)",
            boxShadow: "0 4px 20px rgba(120,140,180,0.12)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-bold text-text-main">Новая задача</span>
            <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-main">
              <X size={14} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="rounded-[10px] border border-[rgba(91,76,245,0.18)] bg-white px-3 py-2 text-[13px] text-text-main focus:outline-none focus:border-accent2"
            >
              <option value="callback">Перезвонить</option>
              <option value="followup">Напоминание</option>
              <option value="confirm_appointment">Подтвердить визит</option>
              <option value="other">Другое</option>
            </select>
            <input
              type="text"
              placeholder="Название задачи"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="flex-1 min-w-[200px] rounded-[10px] border border-[rgba(91,76,245,0.18)] bg-white px-3 py-2 text-[13px] text-text-main placeholder-text-muted focus:outline-none focus:border-accent2"
            />
            <input
              type="datetime-local"
              value={form.due_at}
              onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))}
              className="rounded-[10px] border border-[rgba(91,76,245,0.18)] bg-white px-3 py-2 text-[13px] text-text-main focus:outline-none focus:border-accent2"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!form.title.trim() || !form.due_at || createTask.isPending}
            >
              {createTask.isPending ? "Создаём..." : "Создать"}
            </Button>
          </form>
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-[16px] overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.70)",
          backdropFilter: "blur(18px)",
          border: "1px solid rgba(255,255,255,0.85)",
          boxShadow: "0 4px 18px rgba(120,140,180,0.10)",
        }}
      >
        {isLoading ? (
          <div className="p-8 text-center text-text-muted text-[13px]">Загрузка...</div>
        ) : tasks.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-[13px]">Нет задач</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(91,76,245,0.08)" }}>
                {["", "Задача", "Тип", "Пациент", "Срок", "Статус"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-bold text-text-muted uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map((task, idx) => {
                const isOverdue = !task.is_done && task.due_at && new Date(task.due_at) < now;
                return (
                  <tr
                    key={task.id}
                    style={{
                      borderBottom: idx < tasks.length - 1 ? "1px solid rgba(91,76,245,0.06)" : "none",
                      opacity: task.is_done ? 0.65 : 1,
                    }}
                  >
                    <td className="px-4 py-3 w-9">
                      <button
                        className="hover:opacity-70 transition-opacity"
                        onClick={() => toggleTask.mutate({ taskId: task.id, isDone: !task.is_done })}
                      >
                        {task.is_done ? (
                          <CheckCircle2 size={17} className="text-[#00C9A7]" />
                        ) : (
                          <Circle size={17} className="text-text-muted" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      <span className={`text-[13px] font-semibold ${task.is_done ? "text-text-muted line-through" : "text-text-main"}`}>
                        {task.title ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-[12px] text-text-muted">
                        {task.type && typeIcon[task.type]}
                        {typeLabel[task.type ?? ""] ?? task.type ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-text-muted">
                      {task.patient_name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {task.due_at ? (
                        <span className={`flex items-center gap-1 text-[12px] ${isOverdue ? "text-[#f44b6e] font-semibold" : "text-text-muted"}`}>
                          <Clock size={11} />
                          {format(new Date(task.due_at), "dd MMM yyyy, HH:mm", { locale: ru })}
                        </span>
                      ) : (
                        <span className="text-[12px] text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {task.is_done ? (
                        <Pill variant="green">Выполнено</Pill>
                      ) : isOverdue ? (
                        <Pill variant="red">Просрочено</Pill>
                      ) : (
                        <Pill variant="yellow">В работе</Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
