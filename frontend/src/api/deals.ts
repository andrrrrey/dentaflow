import { useState, useCallback } from "react";

/* ── Types ─────────────────────────────────────────────── */

export interface DealResponse {
  id: string;
  patient_id: string | null;
  patient_name: string | null;
  title: string;
  stage: string;
  amount: number | null;
  service: string | null;
  doctor_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  source_channel: string | null;
  notes: string | null;
  lost_reason: string | null;
  stage_changed_at: string;
  created_at: string;
}

export interface StageColumn {
  stage: string;
  label: string;
  deals: DealResponse[];
  count: number;
  total_amount: number;
}

export interface PipelineResponse {
  stages: StageColumn[];
  total_pipeline_value: number;
}

export interface StageHistoryEntry {
  id: string;
  deal_id: string;
  from_stage: string | null;
  to_stage: string | null;
  changed_by: string | null;
  comment: string | null;
  created_at: string;
}

/* ── Stage config ──────────────────────────────────────── */

export const STAGES: { key: string; label: string }[] = [
  { key: "new", label: "Новые" },
  { key: "contact", label: "Контакт" },
  { key: "negotiation", label: "Переговоры" },
  { key: "scheduled", label: "Записан" },
  { key: "treatment", label: "Лечение" },
  { key: "closed_won", label: "Закрыто \u2713" },
  { key: "closed_lost", label: "Закрыто \u2717" },
];

/* ── Helpers ───────────────────────────────────────────── */

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function uid(n: number): string {
  return `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
}

const ASSIGNED = [
  { id: "a0000000-0000-4000-a000-000000000001", name: "Анна Смирнова" },
  { id: "a0000000-0000-4000-a000-000000000002", name: "Дмитрий Волков" },
  { id: "a0000000-0000-4000-a000-000000000003", name: "Ольга Козлова" },
];

/* ── Mock deals ────────────────────────────────────────── */

const MOCK_DEALS: DealResponse[] = [
  // new
  {
    id: uid(0), patient_id: uid(20), patient_name: "Иванов Сергей",
    title: "Имплантация зубов", stage: "new", amount: 180000,
    service: "Имплантация", doctor_name: "Козлова Е.А.",
    assigned_to: ASSIGNED[0].id, assigned_to_name: ASSIGNED[0].name,
    source_channel: "website", notes: "Обратился через сайт",
    lost_reason: null, stage_changed_at: daysAgo(1), created_at: daysAgo(1),
  },
  {
    id: uid(1), patient_id: uid(21), patient_name: "Петрова Мария",
    title: "Установка виниров", stage: "new", amount: 120000,
    service: "Виниры", doctor_name: "Козлова Е.А.",
    assigned_to: ASSIGNED[1].id, assigned_to_name: ASSIGNED[1].name,
    source_channel: "instagram", notes: null,
    lost_reason: null, stage_changed_at: daysAgo(0), created_at: daysAgo(0),
  },
  {
    id: uid(2), patient_id: uid(22), patient_name: "Кузнецов Алексей",
    title: "Лечение кариеса", stage: "new", amount: 15000,
    service: "Лечение кариеса", doctor_name: "Морозов И.П.",
    assigned_to: ASSIGNED[0].id, assigned_to_name: ASSIGNED[0].name,
    source_channel: "phone", notes: "Звонок на рецепцию",
    lost_reason: null, stage_changed_at: daysAgo(0), created_at: daysAgo(0),
  },
  // contact
  {
    id: uid(3), patient_id: uid(23), patient_name: "Сидорова Елена",
    title: "Ортодонтия — брекеты", stage: "contact", amount: 250000,
    service: "Ортодонтия", doctor_name: "Белова Т.С.",
    assigned_to: ASSIGNED[2].id, assigned_to_name: ASSIGNED[2].name,
    source_channel: "telegram", notes: "Хочет консультацию по брекетам",
    lost_reason: null, stage_changed_at: daysAgo(3), created_at: daysAgo(5),
  },
  {
    id: uid(4), patient_id: uid(24), patient_name: "Морозов Дмитрий",
    title: "Отбеливание зубов", stage: "contact", amount: 25000,
    service: "Отбеливание", doctor_name: "Козлова Е.А.",
    assigned_to: ASSIGNED[1].id, assigned_to_name: ASSIGNED[1].name,
    source_channel: "whatsapp", notes: null,
    lost_reason: null, stage_changed_at: daysAgo(2), created_at: daysAgo(4),
  },
  // negotiation
  {
    id: uid(5), patient_id: null, patient_name: "Васильева Ольга",
    title: "Протезирование", stage: "negotiation", amount: 350000,
    service: "Протезирование", doctor_name: "Морозов И.П.",
    assigned_to: ASSIGNED[0].id, assigned_to_name: ASSIGNED[0].name,
    source_channel: "website", notes: "Требуется полное протезирование верхней челюсти",
    lost_reason: null, stage_changed_at: daysAgo(4), created_at: daysAgo(10),
  },
  {
    id: uid(6), patient_id: uid(25), patient_name: "Новиков Артём",
    title: "Имплантация + виниры", stage: "negotiation", amount: 280000,
    service: "Имплантация", doctor_name: "Козлова Е.А.",
    assigned_to: ASSIGNED[2].id, assigned_to_name: ASSIGNED[2].name,
    source_channel: "instagram", notes: "Комплексный план лечения",
    lost_reason: null, stage_changed_at: daysAgo(2), created_at: daysAgo(7),
  },
  {
    id: uid(7), patient_id: uid(26), patient_name: "Федорова Наталья",
    title: "Лечение кариеса (3 зуба)", stage: "negotiation", amount: 42000,
    service: "Лечение кариеса", doctor_name: "Белова Т.С.",
    assigned_to: ASSIGNED[1].id, assigned_to_name: ASSIGNED[1].name,
    source_channel: "phone", notes: null,
    lost_reason: null, stage_changed_at: daysAgo(1), created_at: daysAgo(6),
  },
  // scheduled
  {
    id: uid(8), patient_id: uid(27), patient_name: "Козлов Андрей",
    title: "Виниры на 6 зубов", stage: "scheduled", amount: 210000,
    service: "Виниры", doctor_name: "Козлова Е.А.",
    assigned_to: ASSIGNED[0].id, assigned_to_name: ASSIGNED[0].name,
    source_channel: "telegram", notes: "Записан на 15 апреля",
    lost_reason: null, stage_changed_at: daysAgo(1), created_at: daysAgo(12),
  },
  {
    id: uid(9), patient_id: uid(28), patient_name: "Белова Ирина",
    title: "Ортодонтия — элайнеры", stage: "scheduled", amount: 190000,
    service: "Ортодонтия", doctor_name: "Белова Т.С.",
    assigned_to: ASSIGNED[2].id, assigned_to_name: ASSIGNED[2].name,
    source_channel: "website", notes: "Записана на консультацию",
    lost_reason: null, stage_changed_at: daysAgo(0), created_at: daysAgo(8),
  },
  {
    id: uid(10), patient_id: uid(29), patient_name: "Егоров Максим",
    title: "Отбеливание + гигиена", stage: "scheduled", amount: 32000,
    service: "Отбеливание", doctor_name: "Морозов И.П.",
    assigned_to: ASSIGNED[1].id, assigned_to_name: ASSIGNED[1].name,
    source_channel: "phone", notes: null,
    lost_reason: null, stage_changed_at: daysAgo(0), created_at: daysAgo(3),
  },
  // treatment
  {
    id: uid(11), patient_id: uid(20), patient_name: "Романова Светлана",
    title: "Имплантация (2 импланта)", stage: "treatment", amount: 240000,
    service: "Имплантация", doctor_name: "Козлова Е.А.",
    assigned_to: ASSIGNED[0].id, assigned_to_name: ASSIGNED[0].name,
    source_channel: "website", notes: "Установлены импланты, ожидание приживления",
    lost_reason: null, stage_changed_at: daysAgo(5), created_at: daysAgo(30),
  },
  {
    id: uid(12), patient_id: uid(21), patient_name: "Тихонов Павел",
    title: "Протезирование на имплантах", stage: "treatment", amount: 320000,
    service: "Протезирование", doctor_name: "Морозов И.П.",
    assigned_to: ASSIGNED[2].id, assigned_to_name: ASSIGNED[2].name,
    source_channel: "telegram", notes: "Второй этап лечения",
    lost_reason: null, stage_changed_at: daysAgo(3), created_at: daysAgo(25),
  },
  // closed_won
  {
    id: uid(13), patient_id: uid(22), patient_name: "Алексеева Дарья",
    title: "Виниры E-max", stage: "closed_won", amount: 180000,
    service: "Виниры", doctor_name: "Козлова Е.А.",
    assigned_to: ASSIGNED[1].id, assigned_to_name: ASSIGNED[1].name,
    source_channel: "instagram", notes: "Лечение завершено успешно",
    lost_reason: null, stage_changed_at: daysAgo(1), created_at: daysAgo(20),
  },
  {
    id: uid(14), patient_id: uid(23), patient_name: "Григорьев Илья",
    title: "Лечение кариеса + пломбы", stage: "closed_won", amount: 28000,
    service: "Лечение кариеса", doctor_name: "Белова Т.С.",
    assigned_to: ASSIGNED[0].id, assigned_to_name: ASSIGNED[0].name,
    source_channel: "phone", notes: "Завершено",
    lost_reason: null, stage_changed_at: daysAgo(0), created_at: daysAgo(14),
  },
  {
    id: uid(15), patient_id: uid(24), patient_name: "Лебедева Анна",
    title: "Отбеливание ZOOM", stage: "closed_won", amount: 22000,
    service: "Отбеливание", doctor_name: "Морозов И.П.",
    assigned_to: ASSIGNED[2].id, assigned_to_name: ASSIGNED[2].name,
    source_channel: "whatsapp", notes: null,
    lost_reason: null, stage_changed_at: daysAgo(2), created_at: daysAgo(10),
  },
  // closed_lost
  {
    id: uid(16), patient_id: uid(25), patient_name: "Орлов Владимир",
    title: "Ортодонтия — брекеты", stage: "closed_lost", amount: 230000,
    service: "Ортодонтия", doctor_name: "Белова Т.С.",
    assigned_to: ASSIGNED[1].id, assigned_to_name: ASSIGNED[1].name,
    source_channel: "website", notes: null,
    lost_reason: "Слишком дорого",
    stage_changed_at: daysAgo(3), created_at: daysAgo(15),
  },
  {
    id: uid(17), patient_id: uid(26), patient_name: "Михайлова Екатерина",
    title: "Имплантация зубов", stage: "closed_lost", amount: 200000,
    service: "Имплантация", doctor_name: "Козлова Е.А.",
    assigned_to: ASSIGNED[0].id, assigned_to_name: ASSIGNED[0].name,
    source_channel: "telegram", notes: null,
    lost_reason: "Выбрала другую клинику",
    stage_changed_at: daysAgo(5), created_at: daysAgo(18),
  },
];

/* ── Mock history ──────────────────────────────────────── */

const MOCK_HISTORY: StageHistoryEntry[] = [
  {
    id: "h0000000-0000-4000-a000-000000000001",
    deal_id: uid(8),
    from_stage: "new", to_stage: "contact",
    changed_by: ASSIGNED[0].id,
    comment: null,
    created_at: daysAgo(10),
  },
  {
    id: "h0000000-0000-4000-a000-000000000002",
    deal_id: uid(8),
    from_stage: "contact", to_stage: "negotiation",
    changed_by: ASSIGNED[0].id,
    comment: "Обсудили план лечения",
    created_at: daysAgo(5),
  },
  {
    id: "h0000000-0000-4000-a000-000000000003",
    deal_id: uid(8),
    from_stage: "negotiation", to_stage: "scheduled",
    changed_by: ASSIGNED[0].id,
    comment: "Записан на приём",
    created_at: daysAgo(1),
  },
];

/* ── Build pipeline from mock deals ────────────────────── */

function buildPipeline(deals: DealResponse[]): PipelineResponse {
  let totalValue = 0;
  const stages: StageColumn[] = STAGES.map(({ key, label }) => {
    const stageDeals = deals.filter((d) => d.stage === key);
    const total = stageDeals.reduce((s, d) => s + (d.amount ?? 0), 0);
    totalValue += total;
    return { stage: key, label, deals: stageDeals, count: stageDeals.length, total_amount: total };
  });
  return { stages, total_pipeline_value: totalValue };
}

/* ── Hook ──────────────────────────────────────────────── */

export function usePipeline() {
  const [deals, setDeals] = useState<DealResponse[]>(MOCK_DEALS);

  const pipeline = buildPipeline(deals);

  const moveDeal = useCallback((dealId: string, toStage: string) => {
    setDeals((prev) =>
      prev.map((d) =>
        d.id === dealId
          ? { ...d, stage: toStage, stage_changed_at: new Date().toISOString() }
          : d,
      ),
    );
  }, []);

  const updateDeal = useCallback(
    (dealId: string, updates: Partial<DealResponse>) => {
      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, ...updates } : d)),
      );
    },
    [],
  );

  const getHistory = useCallback(
    (dealId: string): StageHistoryEntry[] =>
      MOCK_HISTORY.filter((h) => h.deal_id === dealId),
    [],
  );

  return { pipeline, deals, moveDeal, updateDeal, getHistory };
}
