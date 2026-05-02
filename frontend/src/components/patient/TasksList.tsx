import { useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { CheckCircle2, Circle, Clock, Phone, CalendarCheck, RefreshCw, Plus, X } from "lucide-react";
import Pill from "../ui/Pill";
import Button from "../ui/Button";
import type { TaskBrief } from "../../api/patients";
import { useCreateTask, useToggleTask } from "../../api/tasks";

interface TasksListProps {
  tasks: TaskBrief[];
  patientId?: string;
  patientName?: string;
}

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

export default function TasksList({ tasks, patientId, patientName: _patientName }: TasksListProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "callback", title: "", due_at: "" });
  const createTask = useCreateTask();
  const toggleTask = useToggleTask();

  const sorted = [...tasks].sort((a, b) => {
    if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
    const da = a.due_at ? new Date(a.due_at).getTime() : 0;
    const db = b.due_at ? new Date(b.due_at).getTime() : 0;
    return da - db;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.due_at) return;
    createTask.mutate(
      {
        type: form.type,
        title: form.title.trim(),
        due_at: new Date(form.due_at).toISOString(),
        patient_id: patientId ?? null,
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
    <div className="space-y-3">
      {/* Create form toggle */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-[13px] font-semibold text-accent2 hover:opacity-80 transition-opacity"
        >
          <Plus size={15} />
          Добавить задачу
        </button>
      ) : (
        <div
          className="rounded-glass p-[14px_16px]"
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
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full rounded-[10px] border border-[rgba(91,76,245,0.18)] bg-white px-3 py-2 text-[13px] text-text-main focus:outline-none focus:border-accent2"
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
              className="w-full rounded-[10px] border border-[rgba(91,76,245,0.18)] bg-white px-3 py-2 text-[13px] text-text-main placeholder-text-muted focus:outline-none focus:border-accent2"
            />
            <input
              type="datetime-local"
              value={form.due_at}
              onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))}
              className="w-full rounded-[10px] border border-[rgba(91,76,245,0.18)] bg-white px-3 py-2 text-[13px] text-text-main focus:outline-none focus:border-accent2"
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!form.title.trim() || !form.due_at || createTask.isPending}
              >
                {createTask.isPending ? "Создаём..." : "Создать"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                Отмена
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Task list */}
      {sorted.map((task) => {
        const isOverdue = !task.is_done && task.due_at && new Date(task.due_at) < new Date();
        return (
          <div
            key={task.id}
            className="rounded-glass p-[14px_16px]"
            style={{
              background: task.is_done ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.65)",
              backdropFilter: "blur(18px)",
              border: "1px solid rgba(255,255,255,0.85)",
              boxShadow: "0 4px 20px rgba(120,140,180,0.12)",
              opacity: task.is_done ? 0.7 : 1,
            }}
          >
            <div className="flex items-start gap-3">
              {/* Checkbox toggle */}
              <button
                className="flex-shrink-0 mt-0.5 hover:opacity-70 transition-opacity"
                onClick={() => toggleTask.mutate({ taskId: task.id, isDone: !task.is_done })}
              >
                {task.is_done ? (
                  <CheckCircle2 size={18} className="text-[#00C9A7]" />
                ) : (
                  <Circle size={18} className="text-text-muted" />
                )}
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {task.type && typeIcon[task.type]}
                  <span
                    className={`text-[13px] font-bold ${
                      task.is_done ? "text-text-muted line-through" : "text-text-main"
                    } truncate`}
                  >
                    {task.title ?? "Без названия"}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-text-muted">
                  {task.type && (
                    <span>{typeLabel[task.type] ?? task.type}</span>
                  )}
                  {task.due_at && (
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {format(new Date(task.due_at), "dd MMM yyyy, HH:mm", { locale: ru })}
                    </span>
                  )}
                </div>
              </div>

              {/* Status */}
              <div className="flex-shrink-0">
                {task.is_done ? (
                  <Pill variant="green">Выполнено</Pill>
                ) : isOverdue ? (
                  <Pill variant="red">Просрочено</Pill>
                ) : (
                  <Pill variant="yellow">В работе</Pill>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {sorted.length === 0 && !showForm && (
        <div className="text-center py-8 text-text-muted text-[13px]">
          Нет задач
        </div>
      )}
    </div>
  );
}
