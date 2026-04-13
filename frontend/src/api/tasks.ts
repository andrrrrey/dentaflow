import { useState, useCallback } from "react";

/* ── Types ─────────────────────────────────────────────── */

export interface TaskResponse {
  id: string;
  patient_id: string | null;
  patient_name: string | null;
  deal_id: string | null;
  comm_id: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  created_by: string | null;
  type: string | null;
  title: string | null;
  due_at: string | null;
  done_at: string | null;
  is_done: boolean;
  created_at: string;
}

export interface TaskListResponse {
  items: TaskResponse[];
  total: number;
  overdue_count: number;
}

/* ── Helpers ───────────────────────────────────────────── */

function daysAgo(n: number, h = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(d.getHours() - h);
  return d.toISOString();
}

function daysAhead(n: number, h = 14): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
}

function uid(n: number): string {
  return `a1000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
}

function patientUid(n: number): string {
  return `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
}

const ASSIGNED = [
  { id: "a0000000-0000-4000-a000-000000000001", name: "Анна Смирнова" },
  { id: "a0000000-0000-4000-a000-000000000002", name: "Дмитрий Волков" },
  { id: "a0000000-0000-4000-a000-000000000003", name: "Ольга Козлова" },
];

/* ── Mock tasks ────────────────────────────────────────── */

const MOCK_TASKS: TaskResponse[] = [
  {
    id: uid(0), patient_id: patientUid(20), patient_name: "Иванов Сергей",
    deal_id: null, comm_id: null,
    assigned_to: ASSIGNED[0].id, assigned_to_name: ASSIGNED[0].name,
    created_by: ASSIGNED[1].id,
    type: "callback", title: "Перезвонить Ивановой",
    due_at: daysAgo(1, 0), done_at: null, is_done: false,
    created_at: daysAgo(3),
  },
  {
    id: uid(1), patient_id: patientUid(21), patient_name: "Петрова Мария",
    deal_id: null, comm_id: null,
    assigned_to: ASSIGNED[0].id, assigned_to_name: ASSIGNED[0].name,
    created_by: ASSIGNED[0].id,
    type: "confirm_appointment", title: "Подтвердить запись Петрова",
    due_at: daysAhead(0, 16), done_at: null, is_done: false,
    created_at: daysAgo(1),
  },
  {
    id: uid(2), patient_id: patientUid(22), patient_name: "Кузнецов Алексей",
    deal_id: null, comm_id: null,
    assigned_to: ASSIGNED[1].id, assigned_to_name: ASSIGNED[1].name,
    created_by: ASSIGNED[0].id,
    type: "followup", title: "Отправить план лечения Кузнецову",
    due_at: daysAhead(1), done_at: null, is_done: false,
    created_at: daysAgo(2),
  },
  {
    id: uid(3), patient_id: patientUid(23), patient_name: "Сидорова Елена",
    deal_id: null, comm_id: null,
    assigned_to: ASSIGNED[2].id, assigned_to_name: ASSIGNED[2].name,
    created_by: ASSIGNED[1].id,
    type: "callback", title: "Связаться с Сидоровой по результатам КТ",
    due_at: daysAgo(2, 0), done_at: null, is_done: false,
    created_at: daysAgo(5),
  },
  {
    id: uid(4), patient_id: patientUid(24), patient_name: "Морозов Дмитрий",
    deal_id: null, comm_id: null,
    assigned_to: ASSIGNED[0].id, assigned_to_name: ASSIGNED[0].name,
    created_by: ASSIGNED[2].id,
    type: "other", title: "Подготовить документы для Морозова",
    due_at: daysAhead(2), done_at: null, is_done: false,
    created_at: daysAgo(1),
  },
  {
    id: uid(5), patient_id: patientUid(25), patient_name: "Васильева Ольга",
    deal_id: null, comm_id: null,
    assigned_to: ASSIGNED[1].id, assigned_to_name: ASSIGNED[1].name,
    created_by: ASSIGNED[1].id,
    type: "confirm_appointment", title: "Подтвердить визит Васильевой на пятницу",
    due_at: daysAhead(3), done_at: null, is_done: false,
    created_at: daysAgo(0, 2),
  },
  {
    id: uid(6), patient_id: patientUid(26), patient_name: "Новиков Артём",
    deal_id: null, comm_id: null,
    assigned_to: ASSIGNED[0].id, assigned_to_name: ASSIGNED[0].name,
    created_by: ASSIGNED[0].id,
    type: "followup", title: "Написать Новикову в Telegram",
    due_at: daysAgo(1, 0), done_at: daysAgo(0, 5), is_done: true,
    created_at: daysAgo(4),
  },
  {
    id: uid(7), patient_id: patientUid(27), patient_name: "Федорова Наталья",
    deal_id: null, comm_id: null,
    assigned_to: ASSIGNED[2].id, assigned_to_name: ASSIGNED[2].name,
    created_by: ASSIGNED[0].id,
    type: "callback", title: "Перезвонить Федоровой по поводу оплаты",
    due_at: daysAgo(3, 0), done_at: daysAgo(2, 0), is_done: true,
    created_at: daysAgo(5),
  },
  {
    id: uid(8), patient_id: patientUid(28), patient_name: "Козлов Андрей",
    deal_id: null, comm_id: null,
    assigned_to: ASSIGNED[1].id, assigned_to_name: ASSIGNED[1].name,
    created_by: ASSIGNED[2].id,
    type: "other", title: "Уточнить у лаборатории срок изготовления виниров Козлова",
    due_at: daysAgo(1, 5), done_at: null, is_done: false,
    created_at: daysAgo(4),
  },
];

/* ── Hook ──────────────────────────────────────────────── */

export function useTasks(filters?: { assigned_to?: string; is_done?: boolean }) {
  const [tasks, setTasks] = useState<TaskResponse[]>(MOCK_TASKS);

  const filtered = tasks.filter((t) => {
    if (filters?.assigned_to === "me") {
      if (t.assigned_to !== ASSIGNED[0].id) return false;
    } else if (filters?.assigned_to) {
      if (t.assigned_to !== filters.assigned_to) return false;
    }
    if (filters?.is_done !== undefined && t.is_done !== filters.is_done) return false;
    return true;
  });

  const now = new Date().toISOString();
  const overdueCount = filtered.filter(
    (t) => !t.is_done && t.due_at !== null && t.due_at < now,
  ).length;

  const toggleDone = useCallback((taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              is_done: !t.is_done,
              done_at: !t.is_done ? new Date().toISOString() : null,
            }
          : t,
      ),
    );
  }, []);

  const result: TaskListResponse = {
    items: filtered,
    total: filtered.length,
    overdue_count: overdueCount,
  };

  return { data: result, toggleDone };
}
