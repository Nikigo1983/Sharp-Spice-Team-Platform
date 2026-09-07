export const SPIORA_SURVEY_PUBLIC_PATH = "/s/spiora-research";

export const SPIORA_SURVEY_STAFF_TITLE =
  "Анкета для потенциального клиента SPIORA";

export const SPIORA_SURVEY_CLIENT_TITLE =
  "Как у вас устроена работа с клиентами?";

export const SPIORA_SURVEY_CLIENT_SUBTITLE =
  "Короткое исследование рабочих процессов — чтобы SPIORA решала реальные задачи бизнеса, а не предположения.";

export type SpioraOption = {
  id: string;
  label: string;
};

export type SpioraQuestionType =
  | "single"
  | "multi"
  | "text"
  | "scale"
  | "contact";

export type SpioraQuestion = {
  id: string;
  number?: number;
  type: SpioraQuestionType;
  title: string;
  hint?: string;
  required?: boolean;
  options?: SpioraOption[];
  allowOther?: boolean;
  maxSelect?: number;
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
  section?: string;
};

export const SPIORA_SURVEY_INTRO = {
  greeting: "Добрый день!",
  lead: "Помогите нам лучше понять, как сегодня устроены рабочие процессы в вашей компании.",
  body: "Мы хотим увидеть, где команда теряет время на рутину — в работе с клиентами, документами, задачами и оплатами. Эти ответы нужны, чтобы предложить вам решение, которое закрывает именно ваши задачи.",
  duration: "Опрос займёт около 5–7 минут.",
} as const;

export const SPIORA_SURVEY_THANKS =
  "Спасибо! Ваши ответы помогут нам создавать SPIORA на основе реальных бизнес-задач, а не предположений.";

export const Q7_NO_PROBLEMS_ID = "no_major_problems";
export const Q12_NEVER_TRIED_ID = "never_tried";
export const Q18_NO_ID = "no";

export const SPIORA_QUESTIONS: SpioraQuestion[] = [
  {
    id: "q1_industry",
    number: 2,
    type: "single",
    section: "О компании",
    title: "Чем занимается ваша компания?",
    hint: "Один вариант",
    required: true,
    allowOther: true,
    options: [
      { id: "immigration", label: "Иммиграционные / релокационные услуги" },
      { id: "legal", label: "Юридические услуги" },
      { id: "accounting", label: "Бухгалтерия / финансы" },
      { id: "consulting", label: "Консалтинг" },
      { id: "real_estate", label: "Недвижимость" },
      { id: "education", label: "Образование" },
      { id: "tourism", label: "Туризм / travel services" },
    ],
  },
  {
    id: "q2_team_size",
    number: 3,
    type: "single",
    section: "О компании",
    title: "Сколько человек работает в вашей компании?",
    hint: "Один вариант",
    required: true,
    options: [
      { id: "1", label: "1" },
      { id: "2_5", label: "2–5" },
      { id: "6_10", label: "6–10" },
      { id: "11_20", label: "11–20" },
      { id: "21_50", label: "21–50" },
      { id: "50_plus", label: "Более 50" },
    ],
  },
  {
    id: "q3_active_clients",
    number: 4,
    type: "single",
    section: "О компании",
    title:
      "Примерно сколько активных клиентов ваша команда ведёт одновременно?",
    hint: "Один вариант",
    required: true,
    options: [
      { id: "up_to_10", label: "До 10" },
      { id: "11_30", label: "11–30" },
      { id: "31_50", label: "31–50" },
      { id: "51_100", label: "51–100" },
      { id: "101_300", label: "101–300" },
      { id: "300_plus", label: "Более 300" },
      { id: "hard_to_say", label: "Сложно сказать" },
    ],
  },
  {
    id: "q4_client_info",
    number: 5,
    type: "multi",
    section: "Как вы работаете сейчас",
    title: "Где вы сейчас ведёте информацию о клиентах?",
    hint: "Можно выбрать несколько",
    required: true,
    allowOther: true,
    options: [
      { id: "sheets", label: "Excel / Google Sheets" },
      { id: "crm", label: "CRM" },
      { id: "notion", label: "Notion" },
      { id: "drive", label: "Google Drive / Dropbox" },
      { id: "email", label: "Email" },
      { id: "messengers", label: "WhatsApp / Telegram / другие мессенджеры" },
      {
        id: "industry_software",
        label: "Специализированная программа для нашей отрасли",
      },
      {
        id: "fragmented",
        label: "Информация хранится в нескольких разных системах",
      },
      { id: "no_system", label: "Пока нет единой системы" },
    ],
  },
  {
    id: "q5_tools",
    number: 6,
    type: "multi",
    section: "Как вы работаете сейчас",
    title: "Какие инструменты или программы вы используете?",
    hint: "Можно выбрать несколько",
    required: true,
    allowOther: true,
    options: [
      { id: "sheets", label: "Google Sheets / Excel" },
      { id: "drive", label: "Google Drive" },
      { id: "notion", label: "Notion" },
      { id: "bitrix", label: "Bitrix24" },
      { id: "amocrm", label: "amoCRM" },
      { id: "hubspot", label: "HubSpot" },
      { id: "task_tools", label: "Trello / Asana / ClickUp" },
      { id: "1c", label: "1C / бухгалтерская система" },
      { id: "messengers", label: "WhatsApp / Telegram" },
      { id: "none", label: "Никакие специальные системы не используем" },
    ],
  },
  {
    id: "q6_client_journey",
    number: 7,
    type: "text",
    section: "Как вы работаете сейчас",
    title: "Как обычно выглядит работа с новым клиентом?",
    hint: "Коротко опишите путь от первого обращения до завершения работы — 2–3 предложения достаточно.",
    required: false,
  },
  {
    id: "q7_problems",
    number: 8,
    type: "multi",
    section: "Где возникают проблемы",
    title: "С какими ситуациями вы сталкиваетесь в работе?",
    hint: "Можно выбрать несколько",
    required: true,
    allowOther: true,
    options: [
      { id: "lost_leads", label: "Заявки или обращения клиентов теряются" },
      {
        id: "scattered_info",
        label: "Информация о клиенте находится в разных местах",
      },
      {
        id: "search_docs",
        label: "Сотрудникам приходится искать нужные документы",
      },
      {
        id: "lost_docs",
        label: "Документы теряются или используются старые версии",
      },
      { id: "forgotten_tasks", label: "Забываются задачи или сроки" },
      {
        id: "unclear_stage",
        label: "Сложно понять, на каком этапе находится клиент",
      },
      {
        id: "manual_reminders",
        label: "Клиентам приходится напоминать о документах вручную",
      },
      { id: "manual_work", label: "Много повторяющейся ручной работы" },
      {
        id: "reenter_data",
        label: "Одни и те же данные приходится вводить несколько раз",
      },
      {
        id: "hard_to_control",
        label: "Сложно контролировать работу сотрудников",
      },
      {
        id: "payments",
        label: "Сложно отслеживать оплаты и задолженности",
      },
      {
        id: "no_overview",
        label: "Руководителю не хватает общей картины по компании",
      },
      {
        id: "too_much_chat",
        label: "Слишком много общения происходит через мессенджеры",
      },
      {
        id: "too_complex_tools",
        label: "Существующие программы слишком сложные",
      },
      { id: Q7_NO_PROBLEMS_ID, label: "Существенных проблем нет" },
    ],
  },
  {
    id: "q8_top_problems",
    number: 9,
    type: "multi",
    section: "Где возникают проблемы",
    title: "Какие три проблемы из отмеченных выше создают больше всего сложностей?",
    hint: "Выберите до 3",
    required: true,
    maxSelect: 3,
  },
  {
    id: "q9_frequency",
    number: 10,
    type: "single",
    section: "Где возникают проблемы",
    title: "Как часто эти проблемы реально возникают?",
    hint: "Один вариант",
    required: true,
    options: [
      { id: "daily", label: "Практически каждый день" },
      { id: "weekly", label: "Несколько раз в неделю" },
      { id: "monthly", label: "Несколько раз в месяц" },
      { id: "rarely", label: "Редко" },
      { id: "almost_never", label: "Почти никогда" },
    ],
  },
  {
    id: "q10_consequences",
    number: 11,
    type: "multi",
    section: "Где возникают проблемы",
    title: "К чему эти проблемы обычно приводят?",
    hint: "Можно выбрать несколько",
    required: true,
    allowOther: true,
    options: [
      { id: "extra_time", label: "Сотрудники тратят лишнее время" },
      { id: "delays", label: "Работа с клиентом затягивается" },
      { id: "errors", label: "Возникают ошибки" },
      { id: "missed_deadlines", label: "Пропускаются сроки" },
      { id: "unhappy_clients", label: "Клиенты недовольны" },
      { id: "lost_leads", label: "Теряются потенциальные клиенты" },
      { id: "lost_upsell", label: "Теряются повторные продажи" },
      { id: "lost_money", label: "Компания теряет деньги" },
      {
        id: "extra_hires",
        label: "Приходится нанимать дополнительных сотрудников",
      },
      {
        id: "manual_control",
        label: "Руководителю приходится постоянно контролировать всё вручную",
      },
      {
        id: "no_serious",
        label: "Пока не приводят к серьёзным последствиям",
      },
    ],
  },
  {
    id: "q11_pain_score",
    number: 12,
    type: "scale",
    section: "Где возникают проблемы",
    title:
      "Если оценить влияние этих проблем на бизнес, насколько они болезненны?",
    required: true,
    scaleMin: 1,
    scaleMax: 10,
    scaleMinLabel: "практически не мешают",
    scaleMaxLabel: "серьёзно мешают работе и развитию компании",
  },
  {
    id: "q12_tried_crm",
    number: 13,
    type: "single",
    section: "Что уже пробовали",
    title:
      "Пробовали ли вы раньше внедрять CRM или другую систему для управления этими процессами?",
    hint: "Один вариант",
    required: true,
    options: [
      { id: "using_now", label: "Да, используем сейчас" },
      { id: "tried_quit", label: "Да, пробовали, но отказались" },
      { id: "tried_several", label: "Пробовали несколько систем" },
      { id: "considered", label: "Рассматривали, но не внедрили" },
      { id: Q12_NEVER_TRIED_ID, label: "Нет, никогда не пробовали" },
    ],
  },
  {
    id: "q13_crm_issues",
    number: 14,
    type: "multi",
    section: "Что уже пробовали",
    title:
      "Что вас не устраивало в программах, которые вы пробовали или используете сейчас?",
    hint: "Можно выбрать несколько",
    required: true,
    allowOther: true,
    options: [
      { id: "too_hard", label: "Слишком сложно пользоваться" },
      { id: "slow_rollout", label: "Долго внедрять" },
      { id: "no_adoption", label: "Сотрудники не хотят пользоваться системой" },
      { id: "expensive", label: "Слишком дорого" },
      { id: "bloat", label: "Слишком много ненужных функций" },
      { id: "missing_features", label: "Не хватает нужных нам функций" },
      {
        id: "not_fit",
        label: "Не подходит под процессы нашей компании",
      },
      {
        id: "multi_tools",
        label: "Нужно использовать несколько программ одновременно",
      },
      { id: "weak_automation", label: "Слабая автоматизация" },
      { id: "weak_analytics", label: "Не хватает аналитики" },
      { id: "docs_ux", label: "Неудобная работа с документами" },
      { id: "finance_ux", label: "Неудобная работа с финансами / оплатами" },
      { id: "no_portal", label: "Нет нормального клиентского кабинета" },
      { id: "all_fine", label: "В целом всё устраивает" },
    ],
  },
  {
    id: "q14_priority",
    number: 15,
    type: "single",
    section: "Насколько решение важно сейчас",
    title:
      "Насколько для вас сейчас важно улучшить или автоматизировать эти процессы?",
    hint: "Один вариант",
    required: true,
    options: [
      {
        id: "top_priority",
        label: "Один из главных приоритетов сейчас",
      },
      {
        id: "next_6_months",
        label: "Важно — хотим решить в ближайшие 3–6 месяцев",
      },
      { id: "interesting", label: "Интересно, но не срочно" },
      { id: "not_priority", label: "Пока не является приоритетом" },
      { id: "works_fine", label: "Всё и так работает хорошо" },
    ],
  },
  {
    id: "q15_paid_ready",
    number: 16,
    type: "single",
    section: "Готовность платить",
    title:
      "Если система действительно решит основные проблемы вашей компании, готовы ли вы рассматривать платное внедрение?",
    hint: "Один вариант",
    required: true,
    options: [
      { id: "yes", label: "Да, готовы инвестировать" },
      { id: "rather_yes", label: "Скорее да" },
      { id: "maybe", label: "Возможно — зависит от возможностей и цены" },
      { id: "rather_no", label: "Скорее нет" },
      { id: "no", label: "Нет" },
    ],
  },
  {
    id: "q16_budget",
    number: 17,
    type: "single",
    section: "Готовность платить",
    title:
      "Какой ежемесячный бюджет за такую систему вы считаете разумным для вашей компании?",
    hint: "Один вариант",
    required: true,
    options: [
      { id: "up_to_50", label: "До €50 в месяц" },
      { id: "50_100", label: "€50–100" },
      { id: "100_200", label: "€100–200" },
      { id: "200_400", label: "€200–400" },
      { id: "400_700", label: "€400–700" },
      { id: "700_plus", label: "Более €700" },
      { id: "depends", label: "Зависит от результата / экономии" },
      { id: "hard_to_say", label: "Пока сложно оценить" },
    ],
  },
  {
    id: "q17_one_problem",
    number: 18,
    type: "text",
    section: "Главный приоритет",
    title:
      "Если бы вы могли решить только одну проблему в работе с клиентами и внутренними процессами — что бы вы выбрали?",
    hint: "Короткий ответ своими словами",
    required: true,
  },
  {
    id: "q18_contact_ok",
    number: 19,
    type: "single",
    section: "Финальный вопрос",
    title: "Можно ли связаться с вами для короткого разговора на 15–20 минут?",
    hint: "Один вариант",
    required: true,
    options: [
      { id: "yes", label: "Да" },
      { id: "maybe", label: "Возможно" },
      { id: Q18_NO_ID, label: "Нет" },
    ],
  },
  {
    id: "q18_contact_details",
    type: "contact",
    section: "Финальный вопрос",
    title: "Как с вами связаться?",
    required: true,
  },
];

export function getQuestionById(id: string): SpioraQuestion | undefined {
  return SPIORA_QUESTIONS.find((q) => q.id === id);
}

export function optionLabel(
  question: SpioraQuestion,
  optionId: string,
): string {
  return question.options?.find((o) => o.id === optionId)?.label ?? optionId;
}
