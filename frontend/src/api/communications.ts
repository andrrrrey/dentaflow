import { useQuery } from "@tanstack/react-query";
import type {
  CommunicationFilters,
  CommunicationItem,
  CommunicationListResponse,
} from "../types";

/* ── Mock data (returned directly, no API call) ── */

function utcNow(): Date {
  return new Date();
}

function minutesAgo(m: number): string {
  return new Date(utcNow().getTime() - m * 60_000).toISOString();
}

function hoursAgo(h: number): string {
  return new Date(utcNow().getTime() - h * 3_600_000).toISOString();
}

const MOCK_ITEMS: CommunicationItem[] = [
  {
    id: "a0000000-0000-0000-0000-000000000001",
    patient_id: "b0000000-0000-0000-0000-000000000001",
    patient_name: "Мария Соколова",
    channel: "telegram",
    direction: "inbound",
    type: "message",
    content:
      "Здравствуйте! Хочу записаться на отбеливание. Какая стоимость и есть ли свободные даты на следующей неделе?",
    media_url: null,
    duration_sec: null,
    status: "new",
    priority: "high",
    ai_tags: ["горячий_лид", "отбеливание"],
    ai_summary:
      "Пациентка интересуется отбеливанием. Готова записаться на следующую неделю. Высокая вероятность конверсии.",
    ai_next_action:
      "Ответить с ценами на отбеливание и предложить свободные слоты",
    assigned_to: null,
    assigned_to_name: null,
    responded_at: null,
    created_at: minutesAgo(12),
  },
  {
    id: "a0000000-0000-0000-0000-000000000002",
    patient_id: "b0000000-0000-0000-0000-000000000002",
    patient_name: "Дмитрий Козлов",
    channel: "telegram",
    direction: "inbound",
    type: "message",
    content:
      "Добрый день. Мне нужна консультация ортодонта. У ребёнка неправильный прикус, ему 12 лет. Сколько стоит первичный приём?",
    media_url: null,
    duration_sec: null,
    status: "new",
    priority: "normal",
    ai_tags: ["ортодонтия", "детский", "первичный"],
    ai_summary:
      "Отец интересуется ортодонтией для ребёнка 12 лет. Нужна консультация по прикусу.",
    ai_next_action:
      "Предложить запись на консультацию к ортодонту Козлову Д.И.",
    assigned_to: null,
    assigned_to_name: null,
    responded_at: null,
    created_at: minutesAgo(34),
  },
  {
    id: "a0000000-0000-0000-0000-000000000003",
    patient_id: "b0000000-0000-0000-0000-000000000003",
    patient_name: "Елена Васильева",
    channel: "telegram",
    direction: "inbound",
    type: "message",
    content:
      "Спасибо, подтверждаю запись на четверг в 15:00. Нужно ли что-то подготовить перед приёмом?",
    media_url: null,
    duration_sec: null,
    status: "in_progress",
    priority: "normal",
    ai_tags: ["подтверждение", "повторный"],
    ai_summary:
      "Пациентка подтвердила запись на четверг 15:00. Спрашивает о подготовке.",
    ai_next_action: "Отправить инструкцию по подготовке к приёму",
    assigned_to: "c0000000-0000-0000-0000-000000000001",
    assigned_to_name: "Ольга Смирнова",
    responded_at: minutesAgo(15),
    created_at: hoursAgo(2),
  },
  {
    id: "a0000000-0000-0000-0000-000000000004",
    patient_id: "b0000000-0000-0000-0000-000000000004",
    patient_name: "Андрей Новиков",
    channel: "telegram",
    direction: "inbound",
    type: "message",
    content:
      "Это слишком дорого. В другой клинике мне предложили имплант за 35 тысяч. Почему у вас 55?",
    media_url: null,
    duration_sec: null,
    status: "in_progress",
    priority: "high",
    ai_tags: ["возражение_цена", "имплантация"],
    ai_summary:
      "Пациент возражает по цене на имплантацию. Сравнивает с конкурентом (35 vs 55 тыс.).",
    ai_next_action:
      "Объяснить разницу в качестве материалов и гарантии. Предложить рассрочку.",
    assigned_to: "c0000000-0000-0000-0000-000000000001",
    assigned_to_name: "Ольга Смирнова",
    responded_at: minutesAgo(5),
    created_at: hoursAgo(1),
  },
  {
    id: "a0000000-0000-0000-0000-000000000005",
    patient_id: "b0000000-0000-0000-0000-000000000005",
    patient_name: "Ирина Петрова",
    channel: "telegram",
    direction: "outbound",
    type: "message",
    content:
      "Ирина, напоминаем о вашем визите завтра в 10:00 к доктору Ивановой. Ждём вас!",
    media_url: null,
    duration_sec: null,
    status: "done",
    priority: "normal",
    ai_tags: ["напоминание"],
    ai_summary: "Автоматическое напоминание о визите отправлено.",
    ai_next_action: null,
    assigned_to: "c0000000-0000-0000-0000-000000000001",
    assigned_to_name: "Ольга Смирнова",
    responded_at: hoursAgo(3),
    created_at: hoursAgo(3),
  },
  {
    id: "a0000000-0000-0000-0000-000000000006",
    patient_id: "b0000000-0000-0000-0000-000000000006",
    patient_name: "Сергей Морозов",
    channel: "novofon",
    direction: "inbound",
    type: "call",
    content:
      "Пациент звонил для записи на удаление зуба мудрости. Беспокоит боль справа внизу.",
    media_url: null,
    duration_sec: 187,
    status: "new",
    priority: "urgent",
    ai_tags: ["горячий_лид", "хирургия", "боль"],
    ai_summary:
      "Пациент с острой болью. Нужно удаление зуба мудрости. Срочная запись.",
    ai_next_action:
      "Записать на ближайший свободный слот к хирургу Сидоровой",
    assigned_to: null,
    assigned_to_name: null,
    responded_at: null,
    created_at: minutesAgo(8),
  },
  {
    id: "a0000000-0000-0000-0000-000000000007",
    patient_id: "b0000000-0000-0000-0000-000000000007",
    patient_name: "Алексей Белов",
    channel: "novofon",
    direction: "inbound",
    type: "missed_call",
    content: null,
    media_url: null,
    duration_sec: 0,
    status: "new",
    priority: "high",
    ai_tags: ["пропущенный"],
    ai_summary: "Пропущенный звонок. Номер есть в базе — постоянный пациент.",
    ai_next_action: "Перезвонить в течение 15 минут",
    assigned_to: null,
    assigned_to_name: null,
    responded_at: null,
    created_at: minutesAgo(22),
  },
  {
    id: "a0000000-0000-0000-0000-000000000008",
    patient_id: "b0000000-0000-0000-0000-000000000008",
    patient_name: "Ольга Кузнецова",
    channel: "novofon",
    direction: "inbound",
    type: "call",
    content:
      "Пациентка перенесла запись с пятницы на понедельник. Просит утреннее время.",
    media_url: null,
    duration_sec: 94,
    status: "in_progress",
    priority: "normal",
    ai_tags: ["перенос", "повторный"],
    ai_summary: "Перенос записи на понедельник утро. Постоянная пациентка.",
    ai_next_action:
      "Подтвердить перенос записи и отправить SMS-напоминание",
    assigned_to: "c0000000-0000-0000-0000-000000000002",
    assigned_to_name: "Мария Волкова",
    responded_at: hoursAgo(1),
    created_at: hoursAgo(1.5),
  },
  {
    id: "a0000000-0000-0000-0000-000000000009",
    patient_id: "b0000000-0000-0000-0000-000000000009",
    patient_name: "Наталья Лебедева",
    channel: "novofon",
    direction: "outbound",
    type: "call",
    content: "Звонок-напоминание о приёме. Пациентка подтвердила визит.",
    media_url: null,
    duration_sec: 45,
    status: "done",
    priority: "normal",
    ai_tags: ["напоминание", "подтверждение"],
    ai_summary: "Пациентка подтвердила визит по телефону.",
    ai_next_action: null,
    assigned_to: "c0000000-0000-0000-0000-000000000002",
    assigned_to_name: "Мария Волкова",
    responded_at: hoursAgo(4),
    created_at: hoursAgo(4),
  },
  {
    id: "a0000000-0000-0000-0000-000000000010",
    patient_id: "b0000000-0000-0000-0000-000000000010",
    patient_name: "Виктор Семёнов",
    channel: "novofon",
    direction: "outbound",
    type: "call",
    content:
      "Обзвон пациентов на проф. осмотр. Записан на следующую среду.",
    media_url: null,
    duration_sec: 120,
    status: "done",
    priority: "normal",
    ai_tags: ["профосмотр", "повторный"],
    ai_summary:
      "Пациент записан на профосмотр. Последний визит 8 месяцев назад.",
    ai_next_action: null,
    assigned_to: "c0000000-0000-0000-0000-000000000001",
    assigned_to_name: "Ольга Смирнова",
    responded_at: hoursAgo(5),
    created_at: hoursAgo(5),
  },
  {
    id: "a0000000-0000-0000-0000-000000000011",
    patient_id: null,
    patient_name: null,
    channel: "max",
    direction: "inbound",
    type: "message",
    content:
      "Здравствуйте, увидела вашу рекламу ВКонтакте. Делаете ли вы виниры? И примерная цена?",
    media_url: null,
    duration_sec: null,
    status: "new",
    priority: "normal",
    ai_tags: ["горячий_лид", "виниры", "реклама"],
    ai_summary:
      "Новый лид из рекламы VK. Интерес к винирам. Пациентка не в базе.",
    ai_next_action:
      "Запросить контактные данные, рассказать о винирах и пригласить на консультацию",
    assigned_to: null,
    assigned_to_name: null,
    responded_at: null,
    created_at: minutesAgo(45),
  },
  {
    id: "a0000000-0000-0000-0000-000000000012",
    patient_id: "b0000000-0000-0000-0000-000000000012",
    patient_name: "Анна Федорова",
    channel: "max",
    direction: "inbound",
    type: "message",
    content:
      "Можно ли оплатить лечение в рассрочку? У меня большой план лечения.",
    media_url: null,
    duration_sec: null,
    status: "in_progress",
    priority: "normal",
    ai_tags: ["возражение_цена", "рассрочка"],
    ai_summary: "Пациентка интересуется рассрочкой на план лечения.",
    ai_next_action: "Отправить условия рассрочки и варианты оплаты",
    assigned_to: "c0000000-0000-0000-0000-000000000001",
    assigned_to_name: "Ольга Смирнова",
    responded_at: hoursAgo(2),
    created_at: hoursAgo(3),
  },
  {
    id: "a0000000-0000-0000-0000-000000000013",
    patient_id: "b0000000-0000-0000-0000-000000000013",
    patient_name: "Павел Тихонов",
    channel: "max",
    direction: "outbound",
    type: "message",
    content:
      "Павел, ваш план лечения готов. Отправляю его вам в PDF. Жду обратной связи!",
    media_url: "https://example.com/treatment-plan-123.pdf",
    duration_sec: null,
    status: "done",
    priority: "normal",
    ai_tags: ["план_лечения"],
    ai_summary: "План лечения отправлен пациенту через VK.",
    ai_next_action: null,
    assigned_to: "c0000000-0000-0000-0000-000000000002",
    assigned_to_name: "Мария Волкова",
    responded_at: hoursAgo(6),
    created_at: hoursAgo(7),
  },
  {
    id: "a0000000-0000-0000-0000-000000000014",
    patient_id: null,
    patient_name: null,
    channel: "site",
    direction: "inbound",
    type: "form",
    content:
      "Имя: Татьяна. Телефон: +7 (999) 123-45-67. Комментарий: Хочу поставить брекеты, мне 28 лет. Есть ли скидки?",
    media_url: null,
    duration_sec: null,
    status: "new",
    priority: "urgent",
    ai_tags: ["горячий_лид", "ортодонтия", "брекеты"],
    ai_summary:
      "Заявка с сайта. Взрослая ортодонтия (брекеты). Спрашивает о скидках.",
    ai_next_action:
      "Позвонить в течение 5 минут. Предложить бесплатную консультацию ортодонта.",
    assigned_to: null,
    assigned_to_name: null,
    responded_at: null,
    created_at: minutesAgo(3),
  },
  {
    id: "a0000000-0000-0000-0000-000000000015",
    patient_id: null,
    patient_name: null,
    channel: "site",
    direction: "inbound",
    type: "form",
    content:
      "Имя: Роман. Телефон: +7 (926) 987-65-43. Комментарий: Нужна имплантация верхней челюсти. Какие варианты?",
    media_url: null,
    duration_sec: null,
    status: "done",
    priority: "normal",
    ai_tags: ["имплантация", "повторный"],
    ai_summary:
      "Заявка с сайта. Имплантация верхней челюсти. Перезвонили, записан.",
    ai_next_action: null,
    assigned_to: "c0000000-0000-0000-0000-000000000001",
    assigned_to_name: "Ольга Смирнова",
    responded_at: hoursAgo(8),
    created_at: hoursAgo(9),
  },
  {
    id: "a0000000-0000-0000-0000-000000000016",
    patient_id: "b0000000-0000-0000-0000-000000000016",
    patient_name: "Людмила Орлова",
    channel: "telegram",
    direction: "inbound",
    type: "message",
    content:
      "После лечения каналов зуб стал реагировать на холодное. Это нормально? Прошло 3 дня.",
    media_url: null,
    duration_sec: null,
    status: "new",
    priority: "high",
    ai_tags: ["жалоба", "после_лечения", "эндодонтия"],
    ai_summary:
      "Жалоба после лечения каналов. Чувствительность к холодному, 3 дня.",
    ai_next_action:
      "Срочно проконсультировать. Возможно потребуется повторный визит.",
    assigned_to: null,
    assigned_to_name: null,
    responded_at: null,
    created_at: minutesAgo(55),
  },
  {
    id: "a0000000-0000-0000-0000-000000000017",
    patient_id: "b0000000-0000-0000-0000-000000000017",
    patient_name: "Григорий Волков",
    channel: "novofon",
    direction: "inbound",
    type: "call",
    content:
      "Хочет узнать результаты рентгена. Просит перезвонить после 17:00.",
    media_url: null,
    duration_sec: 63,
    status: "done",
    priority: "normal",
    ai_tags: ["рентген", "повторный"],
    ai_summary: "Запрос результатов рентгена. Перезвонить после 17:00.",
    ai_next_action: null,
    assigned_to: "c0000000-0000-0000-0000-000000000002",
    assigned_to_name: "Мария Волкова",
    responded_at: hoursAgo(2),
    created_at: hoursAgo(6),
  },
  {
    id: "a0000000-0000-0000-0000-000000000018",
    patient_id: "b0000000-0000-0000-0000-000000000018",
    patient_name: "Екатерина Зайцева",
    channel: "telegram",
    direction: "inbound",
    type: "message",
    content:
      "Отлично! Спасибо за консультацию. Буду думать и вернусь к вам на следующей неделе.",
    media_url: null,
    duration_sec: null,
    status: "done",
    priority: "normal",
    ai_tags: ["думает", "повторный"],
    ai_summary:
      "Пациентка после консультации берёт паузу. Вернётся на следующей неделе.",
    ai_next_action: null,
    assigned_to: "c0000000-0000-0000-0000-000000000001",
    assigned_to_name: "Ольга Смирнова",
    responded_at: hoursAgo(10),
    created_at: hoursAgo(12),
  },
];

/* ── Fetch function (returns mock data directly) ── */

export async function fetchCommunications(
  params?: CommunicationFilters,
): Promise<CommunicationListResponse> {
  // Simulate async
  await new Promise((r) => setTimeout(r, 150));

  let items = [...MOCK_ITEMS];

  if (params?.status) {
    items = items.filter((i) => i.status === params.status);
  }
  if (params?.channel) {
    items = items.filter((i) => i.channel === params.channel);
  }
  if (params?.priority) {
    items = items.filter((i) => i.priority === params.priority);
  }

  // Sort by created_at desc
  items.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const unread_count = MOCK_ITEMS.filter((i) => i.status === "new").length;

  return { items, total: items.length, unread_count };
}

/* ── React Query hook ── */

export function useCommunications(params?: CommunicationFilters) {
  return useQuery<CommunicationListResponse>({
    queryKey: ["communications", params],
    queryFn: () => fetchCommunications(params),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
