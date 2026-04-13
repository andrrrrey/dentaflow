import { useState, useEffect } from "react";

/* ── Types ─────────────────────────────────────────────── */

export interface PatientResponse {
  id: string;
  external_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  source_channel: string | null;
  is_new_patient: boolean;
  last_visit_at: string | null;
  total_revenue: number;
  ltv_score: number | null;
  tags: string[] | null;
  created_at: string;
}

export interface AppointmentResponse {
  id: string;
  external_id: string | null;
  patient_id: string | null;
  doctor_name: string | null;
  service: string | null;
  branch: string | null;
  scheduled_at: string | null;
  duration_min: number;
  status: string | null;
  no_show_risk: number | null;
  revenue: number | null;
  created_at: string;
}

export interface CommunicationBrief {
  id: string;
  channel: string;
  direction: string;
  type: string;
  content: string | null;
  status: string;
  created_at: string;
}

export interface DealBrief {
  id: string;
  title: string;
  stage: string;
  amount: number | null;
  service: string | null;
  doctor_name: string | null;
  stage_changed_at: string;
  created_at: string;
}

export interface TaskBrief {
  id: string;
  type: string | null;
  title: string | null;
  due_at: string | null;
  is_done: boolean;
  done_at: string | null;
  created_at: string;
}

export interface AIAnalysis {
  summary: string;
  barriers: string[];
  return_probability: number;
  next_action: string;
}

export interface PatientDetailResponse extends PatientResponse {
  appointments: AppointmentResponse[];
  communications: CommunicationBrief[];
  deals: DealBrief[];
  tasks: TaskBrief[];
  ai_analysis: AIAnalysis;
}

export interface PatientListResponse {
  items: PatientResponse[];
  total: number;
}

/* ── Helpers ───────────────────────────────────────────── */

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function daysAgoAt(n: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function pid(n: number): string {
  return `p0000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
}

/* ── Mock patients list ───────────────────────────────── */

const MOCK_PATIENTS: PatientResponse[] = [
  {
    id: pid(1), external_id: "1D-10234", name: "Иванова Анна Сергеевна",
    phone: "+7 (926) 123-45-67", email: "ivanova.anna@mail.ru",
    birth_date: "1990-03-15", source_channel: "telegram",
    is_new_patient: false, last_visit_at: daysAgo(5),
    total_revenue: 185000, ltv_score: 82,
    tags: ["VIP", "ортодонтия", "рассрочка"], created_at: daysAgo(180),
  },
  {
    id: pid(2), external_id: "1D-10235", name: "Петров Дмитрий Владимирович",
    phone: "+7 (903) 987-65-43", email: "petrov.dv@gmail.com",
    birth_date: "1985-07-22", source_channel: "site",
    is_new_patient: false, last_visit_at: daysAgo(12),
    total_revenue: 320000, ltv_score: 91,
    tags: ["VIP", "имплантация"], created_at: daysAgo(365),
  },
  {
    id: pid(3), external_id: "1D-10236", name: "Козлова Елена Александровна",
    phone: "+7 (915) 555-12-34", email: "kozlova.ea@yandex.ru",
    birth_date: "1995-11-08", source_channel: "telegram",
    is_new_patient: true, last_visit_at: daysAgo(2),
    total_revenue: 15000, ltv_score: 45,
    tags: ["новый", "отбеливание"], created_at: daysAgo(10),
  },
  {
    id: pid(4), external_id: "1D-10237", name: "Сидоров Алексей Михайлович",
    phone: "+7 (916) 777-88-99", email: null,
    birth_date: "1978-01-30", source_channel: "call",
    is_new_patient: false, last_visit_at: daysAgo(45),
    total_revenue: 95000, ltv_score: 38,
    tags: ["протезирование", "риск_оттока"], created_at: daysAgo(400),
  },
  {
    id: pid(5), external_id: "1D-10238", name: "Морозова Ольга Петровна",
    phone: "+7 (925) 333-22-11", email: "morozova.op@mail.ru",
    birth_date: "1992-06-17", source_channel: "max",
    is_new_patient: false, last_visit_at: daysAgo(8),
    total_revenue: 210000, ltv_score: 75,
    tags: ["виниры", "повторный"], created_at: daysAgo(200),
  },
  {
    id: pid(6), external_id: "1D-10239", name: "Васильев Николай Игоревич",
    phone: "+7 (909) 444-55-66", email: "vasiliev.ni@gmail.com",
    birth_date: "1982-12-03", source_channel: "referral",
    is_new_patient: false, last_visit_at: daysAgo(20),
    total_revenue: 540000, ltv_score: 95,
    tags: ["VIP", "имплантация", "протезирование"], created_at: daysAgo(500),
  },
  {
    id: pid(7), external_id: "1D-10240", name: "Новикова Мария Андреевна",
    phone: "+7 (917) 111-22-33", email: "novikova.ma@yandex.ru",
    birth_date: "2000-09-25", source_channel: "telegram",
    is_new_patient: true, last_visit_at: null,
    total_revenue: 0, ltv_score: 20,
    tags: ["новый", "консультация"], created_at: daysAgo(1),
  },
  {
    id: pid(8), external_id: "1D-10241", name: "Фёдоров Артём Викторович",
    phone: "+7 (926) 888-99-00", email: "fedorov.av@mail.ru",
    birth_date: "1988-04-11", source_channel: "site",
    is_new_patient: false, last_visit_at: daysAgo(3),
    total_revenue: 78000, ltv_score: 60,
    tags: ["лечение", "гигиена"], created_at: daysAgo(90),
  },
  {
    id: pid(9), external_id: "1D-10242", name: "Белова Татьяна Сергеевна",
    phone: "+7 (903) 222-33-44", email: "belova.ts@gmail.com",
    birth_date: "1975-08-19", source_channel: "call",
    is_new_patient: false, last_visit_at: daysAgo(60),
    total_revenue: 150000, ltv_score: 42,
    tags: ["риск_оттока", "протезирование"], created_at: daysAgo(600),
  },
  {
    id: pid(10), external_id: "1D-10243", name: "Егоров Максим Дмитриевич",
    phone: "+7 (915) 666-77-88", email: "egorov.md@yandex.ru",
    birth_date: "1998-02-14", source_channel: "telegram",
    is_new_patient: false, last_visit_at: daysAgo(1),
    total_revenue: 42000, ltv_score: 55,
    tags: ["гигиена", "отбеливание"], created_at: daysAgo(30),
  },
];

/* ── Mock detail for patient 1 ────────────────────────── */

const MOCK_APPOINTMENTS: AppointmentResponse[] = [
  {
    id: "a1000000-0000-4000-a000-000000000001",
    external_id: "APT-5001", patient_id: pid(1),
    doctor_name: "Козлова Е.А.", service: "Консультация ортодонта",
    branch: "Клиника на Тверской", scheduled_at: daysAgoAt(5, 10),
    duration_min: 60, status: "completed", no_show_risk: 5,
    revenue: 3000, created_at: daysAgo(7),
  },
  {
    id: "a1000000-0000-4000-a000-000000000002",
    external_id: "APT-4892", patient_id: pid(1),
    doctor_name: "Козлова Е.А.", service: "Установка брекетов (верхняя челюсть)",
    branch: "Клиника на Тверской", scheduled_at: daysAgoAt(30, 14),
    duration_min: 90, status: "completed", no_show_risk: 8,
    revenue: 85000, created_at: daysAgo(32),
  },
  {
    id: "a1000000-0000-4000-a000-000000000003",
    external_id: "APT-4650", patient_id: pid(1),
    doctor_name: "Морозов И.П.", service: "Профессиональная гигиена",
    branch: "Клиника на Тверской", scheduled_at: daysAgoAt(90, 11),
    duration_min: 45, status: "completed", no_show_risk: 3,
    revenue: 7000, created_at: daysAgo(92),
  },
  {
    id: "a1000000-0000-4000-a000-000000000004",
    external_id: "APT-4401", patient_id: pid(1),
    doctor_name: "Белова Т.С.", service: "Лечение кариеса (зуб 36)",
    branch: "Клиника на Тверской", scheduled_at: daysAgoAt(120, 16),
    duration_min: 60, status: "completed", no_show_risk: 12,
    revenue: 12000, created_at: daysAgo(122),
  },
  {
    id: "a1000000-0000-4000-a000-000000000005",
    external_id: null, patient_id: pid(1),
    doctor_name: "Козлова Е.А.", service: "Контрольный осмотр (ортодонтия)",
    branch: "Клиника на Тверской", scheduled_at: daysAgoAt(-3, 10),
    duration_min: 30, status: "scheduled", no_show_risk: 15,
    revenue: null, created_at: daysAgo(0),
  },
];

const MOCK_COMMS: CommunicationBrief[] = [
  {
    id: "c1000000-0000-4000-a000-000000000001",
    channel: "telegram", direction: "inbound", type: "message",
    content: "Здравствуйте! Хочу уточнить время моего следующего приёма.",
    status: "done", created_at: daysAgoAt(1, 9),
  },
  {
    id: "c1000000-0000-4000-a000-000000000002",
    channel: "telegram", direction: "outbound", type: "message",
    content: "Анна, ваш приём назначен на 16 апреля в 10:00. Ждём вас!",
    status: "done", created_at: daysAgoAt(1, 10),
  },
  {
    id: "c1000000-0000-4000-a000-000000000003",
    channel: "novofon", direction: "inbound", type: "call",
    content: "Звонок по вопросу рассрочки на ортодонтическое лечение.",
    status: "done", created_at: daysAgoAt(10, 14),
  },
  {
    id: "c1000000-0000-4000-a000-000000000004",
    channel: "telegram", direction: "inbound", type: "message",
    content: "Можно ли перенести приём на другой день? Не могу в четверг.",
    status: "in_progress", created_at: daysAgoAt(0, 15),
  },
  {
    id: "c1000000-0000-4000-a000-000000000005",
    channel: "novofon", direction: "outbound", type: "call",
    content: "Напоминание о визите. Пациентка подтвердила.",
    status: "done", created_at: daysAgoAt(6, 11),
  },
];

const MOCK_DEALS: DealBrief[] = [
  {
    id: "d1000000-0000-4000-a000-000000000001",
    title: "Ортодонтия — брекеты", stage: "treatment",
    amount: 180000, service: "Ортодонтия", doctor_name: "Козлова Е.А.",
    stage_changed_at: daysAgo(5), created_at: daysAgo(35),
  },
  {
    id: "d1000000-0000-4000-a000-000000000002",
    title: "Профессиональная гигиена", stage: "closed_won",
    amount: 7000, service: "Гигиена", doctor_name: "Морозов И.П.",
    stage_changed_at: daysAgo(88), created_at: daysAgo(95),
  },
];

const MOCK_TASKS: TaskBrief[] = [
  {
    id: "t1000000-0000-4000-a000-000000000001",
    type: "confirm_appointment", title: "Подтвердить визит 16 апреля",
    due_at: daysAgoAt(-1, 9), is_done: false, done_at: null,
    created_at: daysAgo(0),
  },
  {
    id: "t1000000-0000-4000-a000-000000000002",
    type: "followup", title: "Напомнить о контрольном снимке",
    due_at: daysAgoAt(-7, 10), is_done: false, done_at: null,
    created_at: daysAgo(2),
  },
  {
    id: "t1000000-0000-4000-a000-000000000003",
    type: "callback", title: "Перезвонить по вопросу рассрочки",
    due_at: daysAgoAt(1, 14), is_done: true, done_at: daysAgoAt(1, 15),
    created_at: daysAgo(2),
  },
];

const MOCK_AI: AIAnalysis = {
  summary:
    "Пациентка проходит ортодонтическое лечение (брекеты). Высокая вовлечённость: " +
    "регулярно посещает приёмы, активно общается через Telegram. " +
    "Интересуется рассрочкой — может быть чувствительна к цене на следующие этапы. " +
    "Рекомендуется предложить программу лояльности и закрепить долгосрочные отношения.",
  barriers: [
    "Чувствительность к цене",
    "Занятость (переносы приёмов)",
    "Нет времени на длительные визиты",
  ],
  return_probability: 82,
  next_action:
    "Подтвердить визит 16 апреля и предложить оформить рассрочку на оставшийся этап лечения",
};

function buildMockDetail(patient: PatientResponse): PatientDetailResponse {
  return {
    ...patient,
    appointments: MOCK_APPOINTMENTS,
    communications: MOCK_COMMS,
    deals: MOCK_DEALS,
    tasks: MOCK_TASKS,
    ai_analysis: MOCK_AI,
  };
}

/* ── Hooks ─────────────────────────────────────────────── */

export function usePatientDetail(id: string | undefined) {
  const [data, setData] = useState<PatientDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      const patient = MOCK_PATIENTS.find((p) => p.id === id);
      if (patient) {
        setData(buildMockDetail(patient));
      } else {
        setData(null);
      }
      setIsLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [id]);

  return { data, isLoading };
}

export function usePatients(search: string) {
  const [data, setData] = useState<PatientListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      let items = [...MOCK_PATIENTS];
      if (search) {
        const q = search.toLowerCase();
        items = items.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.phone && p.phone.includes(q)) ||
            (p.email && p.email.toLowerCase().includes(q)),
        );
      }
      setData({ items, total: items.length });
      setIsLoading(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [search]);

  return { data, isLoading };
}
