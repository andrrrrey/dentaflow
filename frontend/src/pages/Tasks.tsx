import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  CheckCircle2, Circle, Clock, Phone, CalendarCheck, RefreshCw,
  AlertTriangle, Plus, X, Trash2, ChevronLeft, ChevronRight, Zap,
  CheckSquare, Square,
} from "lucide-react";
import Pill from "../components/ui/Pill";
import Button from "../components/ui/Button";
import PatientSearchInput from "../components/ui/PatientSearchInput";
import { useTasks, useCreateTask, useToggleTask, useDeleteTask, useGenerateAutoTasks, useBulkDeleteTasks } from "../api/tasks";
import { useStaff } from "../api/staff";

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

const PAGE_SIZE = 15;

type Filter = "all" | "active" | "done" | "archive";

function getFilterParams(filter: Filter): { is_done?: boolean; is_active?: boolean } {
  if (filter === "active") return { is_done: false };
  if (filter === "done") return { is_done: true };
  if (filter === "archive") return { is_active: false };
  return {};
}

export default function Tasks() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [filterAssigned, setFilterAssigned] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: "callback",
    title: "",
    due_at: "",
    patient_id: "",
    patient_name: "",
    assigned_to: "",
  });

  const { data, isLoading } = useTasks({
    ...getFilterParams(filter),
    ...(filterAssigned ? { assigned_to: filterAssigned } : {}),
  });
  const { data: staffData } = useStaff();
  const admins = (staffData?.staff ?? []).filter(
    (s) => s.is_active && (s.role === "admin" || s.role === "manager")
  );
  const createTask = useCreateTask();
  const toggleTask = useToggleTask();
  const deleteTask = useDeleteTask();
  const generateTasks = useGenerateAutoTasks();
  const bulkDeleteTasks = useBulkDeleteTasks();

  const allTasks = data?.items ?? [];
  const now = new Date();

  const totalPages = Math.max(1, Math.ceil(allTasks.length / PAGE_SIZE));
  const pageTasks = allTasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const allSelected = allTasks.length > 0 && allTasks.every((t) => selectedIds.has(t.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(allTasks.map((t) => t.id)));
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Удалить выбранные задачи (${selectedIds.size})? Это действие необратимо.`)) return;
    bulkDeleteTasks.mutate(Array.from(selectedIds), {
      onSuccess: () => { setSelectedIds(new Set()); setPage(1); },
    });
  };

  const handleFilterChange = (f: Filter) => {
    setFilter(f);
    setPage(1);
    setSelectedIds(new Set());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.due_at) return;
    createTask.mutate(
      {
        type: form.type,
        title: form.title.trim(),
        due_at: new Date(form.due_at).toISOString(),
        patient_id: form.patient_id || null,
        assigned_to: form.assigned_to || null,
      },
      {
        onSuccess: () => {
          setForm({ type: "callback", title: "", due_at: "", patient_id: "", patient_name: "", assigned_to: "" });
          setShowForm(false);
          setPage(1);
        },
      }
    );
  };

  const FILTER_TABS: { key: Filter; label: string }[] = [
    { key: "all", label: "Все" },
    { key: "active", label: "Активные" },
    { key: "done", label: "Выполненные" },
    { key: "archive", label: "Архив" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {FILTER_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleFilterChange(key)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
                filter === key
                  ? "bg-accent2 text-white"
                  : "bg-[rgba(91,76,245,0.08)] text-text-muted hover:bg-[rgba(91,76,245,0.14)]"
              }`}
            >
              {label}
            </button>
          ))}
          {data && data.overdue_count > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-[#f44b6e]">
              <AlertTriangle size={12} />
              {data.overdue_count} просрочено
            </span>
          )}
          <select
            value={filterAssigned}
            onChange={(e) => { setFilterAssigned(e.target.value); setPage(1); }}
            className="rounded-xl px-3 py-[6px] text-[12.5px] font-medium text-text-main outline-none cursor-pointer"
            style={{ background: "rgba(255,255,255,0.65)", border: "1px solid rgba(91,76,245,0.15)" }}
          >
            <option value="">Все ответственные</option>
            {admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {allTasks.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={toggleSelectAll}
              title={allSelected ? "Снять выделение со всех задач" : "Выделить все задачи"}
            >
              {allSelected ? <CheckSquare size={14} className="mr-1.5" /> : <Square size={14} className="mr-1.5" />}
              {allSelected ? "Снять выделение" : "Выделить все"}
            </Button>
          )}
          {someSelected && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleBulkDelete}
              disabled={bulkDeleteTasks.isPending}
              className="!text-[#f44b6e]"
              style={{ background: "rgba(244,75,110,0.08)", borderColor: "rgba(244,75,110,0.25)" }}
              title="Удалить выбранные задачи"
            >
              <Trash2 size={14} className="mr-1.5" />
              {bulkDeleteTasks.isPending ? "Удаление..." : `Удалить выбранные (${selectedIds.size})`}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              generateTasks.mutate(undefined, {
                onSuccess: () => { setFilter("all"); setPage(1); },
              })
            }
            disabled={generateTasks.isPending}
            title="Создать задачи-обзвон для подтверждения визитов на завтра (звонить сегодня)"
          >
            <Zap size={14} className={`mr-1.5 ${generateTasks.isPending ? "animate-pulse" : ""}`} />
            {generateTasks.isPending ? "Генерация..." : "Сгенерировать на сегодня"}
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus size={14} className="mr-1.5" />
            Новая задача
          </Button>
        </div>
      </div>

      {generateTasks.isSuccess && generateTasks.data && (
        <div className="text-[12px] text-text-muted -mt-2">
          {generateTasks.data.created > 0 ? (
            <span className="text-green-600 font-medium">
              ✓ Создано задач: {generateTasks.data.created}
            </span>
          ) : (
            <span>Новых задач нет — на сегодня уже всё создано (пропущено: {generateTasks.data.skipped}).</span>
          )}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div
          className="rounded-[16px] p-[16px_18px]"
          style={{
            background: "rgba(255,255,255,0.75)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.85)",
            boxShadow: "0 4px 20px rgba(120,140,180,0.12)",
            overflow: "visible",
            position: "relative",
            zIndex: 20,
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-bold text-text-main">Новая задача</span>
            <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-main">
              <X size={14} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end" style={{ position: "relative", zIndex: 10 }}>
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
            <div className="w-[220px]">
              <PatientSearchInput
                value={form.patient_name}
                onChangeName={(name) => setForm((f) => ({ ...f, patient_name: name, patient_id: "" }))}
                onSelectPatient={(id, name) => setForm((f) => ({ ...f, patient_id: id, patient_name: name }))}
                placeholder="Пациент (необязательно)"
                className="border border-[rgba(91,76,245,0.18)] bg-white focus:border-accent2"
                inputStyle={{ padding: "7px 12px" }}
              />
            </div>
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
            <select
              value={form.assigned_to}
              onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}
              className="rounded-[10px] bg-white px-3 py-2 text-[13px] text-text-main focus:outline-none"
              style={{ border: "1px solid rgba(91,76,245,0.18)" }}
            >
              <option value="">Ответственный (необязательно)</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
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
        ) : allTasks.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-[13px]">
            {filter === "archive" ? "Архив пуст — истёкших задач нет" : "Нет задач"}
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(91,76,245,0.08)" }}>
                  <th className="px-4 py-3 w-9 text-left">
                    <button
                      onClick={toggleSelectAll}
                      className="hover:opacity-70 transition-opacity align-middle"
                      title={allSelected ? "Снять выделение" : "Выделить все"}
                    >
                      {allSelected ? (
                        <CheckSquare size={16} className="text-accent2" />
                      ) : (
                        <Square size={16} className="text-text-muted" />
                      )}
                    </button>
                  </th>
                  {["", "Задача", "Тип", "Пациент", "Исполнитель", "Срок", "Статус", ""].map((h, i) => (
                    <th
                      key={i}
                      className="px-4 py-3 text-left text-[11px] font-bold text-text-muted uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageTasks.map((task, idx) => {
                  const isOverdue = !task.is_done && task.due_at && new Date(task.due_at) < now;
                  const isInactive = !task.is_active && !task.is_done;
                  const rowOpacity = task.is_done || isInactive ? 0.55 : 1;

                  const executorName = task.is_done
                    ? (task.completed_by_name ?? task.assigned_to_name)
                    : task.assigned_to_name;

                  return (
                    <tr
                      key={task.id}
                      style={{
                        borderBottom: idx < pageTasks.length - 1 ? "1px solid rgba(91,76,245,0.06)" : "none",
                        opacity: rowOpacity,
                      }}
                    >
                      <td className="px-4 py-3 w-9">
                        <button
                          className="hover:opacity-70 transition-opacity align-middle"
                          onClick={() => toggleSelectOne(task.id)}
                          title="Выделить задачу"
                        >
                          {selectedIds.has(task.id) ? (
                            <CheckSquare size={16} className="text-accent2" />
                          ) : (
                            <Square size={16} className="text-text-muted" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 w-9">
                        {!isInactive && (
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
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[280px]">
                        <div className="flex items-center gap-2">
                          {task.is_auto && (
                            <span
                              className="flex items-center gap-[3px] px-[6px] py-[2px] rounded-full text-[10px] font-bold flex-shrink-0"
                              style={{ background: "rgba(59,127,237,0.1)", color: "#3B7FED" }}
                              title="Автоматически создана системой"
                            >
                              <Zap size={9} />
                              Авто
                            </span>
                          )}
                          <span
                            className={`text-[13px] font-semibold ${
                              (task.is_done || isInactive) ? "text-text-muted line-through" : "text-text-main"
                            }`}
                          >
                            {task.title ?? "—"}
                          </span>
                        </div>
                        {task.is_done && task.done_at && (
                          <div className="text-[11px] text-[#00C9A7] flex items-center gap-1 mt-[2px]">
                            <CheckCircle2 size={10} />
                            Выполнено {format(new Date(task.done_at), "dd MMM yyyy, HH:mm", { locale: ru })}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-[12px] text-text-muted">
                          {task.type && typeIcon[task.type]}
                          {typeLabel[task.type ?? ""] ?? task.type ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[12.5px]">
                        {task.patient_id && task.patient_name ? (
                          <button
                            onClick={() => navigate(`/patients/${task.patient_id}`)}
                            className="text-accent2 font-semibold hover:underline bg-transparent border-none cursor-pointer p-0 text-left"
                          >
                            {task.patient_name}
                          </button>
                        ) : (
                          <span className="text-text-muted">{task.patient_name ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12.5px]">
                        {executorName ? (
                          <span className="text-text-main font-medium">{executorName}</span>
                        ) : task.is_auto && !task.is_done ? (
                          <span className="text-[11px] text-text-muted italic">Общая задача</span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {task.due_at ? (
                          <span
                            className={`flex items-center gap-1 text-[12px] ${
                              isOverdue ? "text-[#f44b6e] font-semibold" : "text-text-muted"
                            }`}
                          >
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
                        ) : isInactive ? (
                          <Pill variant="gray">Истёк</Pill>
                        ) : isOverdue ? (
                          <Pill variant="red">Просрочено</Pill>
                        ) : (
                          <Pill variant="yellow">В работе</Pill>
                        )}
                      </td>
                      <td className="px-4 py-3 w-9">
                        <button
                          className="text-text-muted hover:text-[#f44b6e] transition-colors"
                          onClick={() => deleteTask.mutate(task.id)}
                          title="Удалить"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderTop: "1px solid rgba(91,76,245,0.08)" }}
              >
                <span className="text-[12px] text-text-muted">
                  Стр. {page} из {totalPages} · {allTasks.length} задач
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="w-8 h-8 rounded-[9px] flex items-center justify-center border-none cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let p: number;
                    if (totalPages <= 5) p = i + 1;
                    else if (page <= 3) p = i + 1;
                    else if (page >= totalPages - 2) p = totalPages - 4 + i;
                    else p = page - 2 + i;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className="w-8 h-8 rounded-[9px] text-[12.5px] font-semibold border-none cursor-pointer"
                        style={
                          p === page
                            ? { background: "linear-gradient(135deg,#5B4CF5,#3B7FED)", color: "#fff" }
                            : { background: "rgba(91,76,245,0.06)", color: "#5B4CF5" }
                        }
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="w-8 h-8 rounded-[9px] flex items-center justify-center border-none cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "rgba(91,76,245,0.08)", color: "#5B4CF5" }}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
