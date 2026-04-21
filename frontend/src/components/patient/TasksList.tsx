import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { CheckCircle2, Circle, Clock, Phone, CalendarCheck, RefreshCw } from "lucide-react";
import Pill from "../ui/Pill";
import type { TaskBrief } from "../../api/patients";

interface TasksListProps {
  tasks: TaskBrief[];
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

export default function TasksList({ tasks }: TasksListProps) {
  const sorted = [...tasks].sort((a, b) => {
    // Undone first, then by due_at
    if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
    const da = a.due_at ? new Date(a.due_at).getTime() : 0;
    const db = b.due_at ? new Date(b.due_at).getTime() : 0;
    return da - db;
  });

  return (
    <div className="space-y-3">
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
              {/* Checkbox icon */}
              <div className="flex-shrink-0 mt-0.5">
                {task.is_done ? (
                  <CheckCircle2 size={18} className="text-[#00C9A7]" />
                ) : (
                  <Circle size={18} className="text-text-muted" />
                )}
              </div>

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

      {sorted.length === 0 && (
        <div className="text-center py-8 text-text-muted text-[13px]">
          Нет задач
        </div>
      )}
    </div>
  );
}
