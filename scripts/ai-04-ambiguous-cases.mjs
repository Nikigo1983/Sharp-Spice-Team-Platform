/**
 * AI-04: ambiguous AI-classifier evaluation fixtures.
 * NOT used by production routing rules — benchmark-only.
 */

/** @typedef {"knowledge_base"|"clients"|"emigrant_drive"|"emigrant_desk"|"formgrid"} RouteSource */

/**
 * @typedef {object} Ai04Case
 * @property {string} id
 * @property {"ru"|"en"} language
 * @property {string} category
 * @property {string} query
 * @property {RouteSource[]} expectedSources
 * @property {RouteSource[]} [forbiddenSources]
 */

/** @type {Ai04Case[]} */
export const AI04_AMBIGUOUS_CASES = [
  // Knowledge vs Drive / Clients
  {
    id: "amb-kb-01",
    language: "ru",
    category: "knowledge_base",
    query: "Подскажи, что обычно просят для residence permit в Хорватии?",
    expectedSources: ["knowledge_base"],
    forbiddenSources: ["emigrant_drive", "clients"],
  },
  {
    id: "amb-kb-02",
    language: "ru",
    category: "knowledge_base",
    query: "Есть ли ограничение по доходу у remote worker программы?",
    expectedSources: ["knowledge_base"],
    forbiddenSources: ["clients"],
  },
  {
    id: "amb-kb-03",
    language: "en",
    category: "knowledge_base",
    query: "What papers are typically requested for Croatian temporary stay?",
    expectedSources: ["knowledge_base"],
    forbiddenSources: ["emigrant_drive"],
  },
  {
    id: "amb-kb-04",
    language: "en",
    category: "knowledge_base",
    query: "Can applicants bring dependents on the digital nomad track?",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "amb-kb-05",
    language: "ru",
    category: "knowledge_base",
    query: "Напомни срок действия разрешения и когда надо продлевать.",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "amb-kb-06",
    language: "ru",
    category: "knowledge_base",
    query: "Чем отличается основание по бизнесу от основания по работе?",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "amb-kb-07",
    language: "en",
    category: "knowledge_base",
    query: "Explain the income threshold applicants usually need to show.",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "amb-kb-08",
    language: "ru",
    category: "knowledge_base",
    query: "Какие медицинские страховки принимаются для подачи?",
    expectedSources: ["knowledge_base"],
  },

  // Client-specific / Drive
  {
    id: "amb-cli-01",
    language: "ru",
    category: "clients",
    query: "Где сейчас по статусу у Калашниковой?",
    expectedSources: ["clients"],
  },
  {
    id: "amb-cli-02",
    language: "ru",
    category: "clients",
    query: "Сколько ещё должен этот клиент по оплате?",
    expectedSources: ["clients"],
  },
  {
    id: "amb-cli-03",
    language: "en",
    category: "clients",
    query: "Show me clients assigned to referent Marina.",
    expectedSources: ["clients"],
  },
  {
    id: "amb-cli-04",
    language: "ru",
    category: "clients",
    query: "Найди карточку по email ivanov@example.com",
    expectedSources: ["clients"],
  },
  {
    id: "amb-drive-01",
    language: "ru",
    category: "emigrant_drive",
    query: "Проверь, загрузил ли Сергей Белов скан страховки.",
    expectedSources: ["clients", "emigrant_drive"],
  },
  {
    id: "amb-drive-02",
    language: "ru",
    category: "emigrant_drive",
    query: "Открой PDF трудовой договор у Анны Смирновой.",
    expectedSources: ["clients", "emigrant_drive"],
  },
  {
    id: "amb-drive-03",
    language: "en",
    category: "emigrant_drive",
    query: "Which files did Maria Belova upload to her case folder?",
    expectedSources: ["clients", "emigrant_drive"],
  },
  {
    id: "amb-drive-04",
    language: "ru",
    category: "emigrant_drive",
    query: "Есть ли в папке клиента копия банковской выписки?",
    expectedSources: ["clients", "emigrant_drive"],
  },

  // Multi-source
  {
    id: "amb-multi-01",
    language: "ru",
    category: "multi",
    query: "Сверь пакет документов Игоря с тем, что нужно для ВНЖ.",
    expectedSources: ["clients", "emigrant_drive", "knowledge_base"],
  },
  {
    id: "amb-multi-02",
    language: "ru",
    category: "multi",
    query: "У Ольги не хватает бумаг для digital nomad — что именно и по правилам программы?",
    expectedSources: ["clients", "emigrant_drive", "knowledge_base"],
  },
  {
    id: "amb-multi-03",
    language: "en",
    category: "multi",
    query: "Compare Petrov's uploaded set against the residence checklist.",
    expectedSources: ["clients", "emigrant_drive", "knowledge_base"],
  },
  {
    id: "amb-multi-04",
    language: "ru",
    category: "multi",
    query: "Напиши Елене письмо и перечисли отсутствующие документы по чеклисту ВНЖ.",
    expectedSources: ["clients", "emigrant_drive", "knowledge_base"],
  },

  // Generation
  {
    id: "amb-gen-01",
    language: "ru",
    category: "generation",
    query: "Переформулируй этот абзац вежливее, без фактов из системы.",
    expectedSources: [],
  },
  {
    id: "amb-gen-02",
    language: "en",
    category: "generation",
    query: "Rewrite this reminder email in a warmer tone.",
    expectedSources: [],
  },
  {
    id: "amb-gen-03",
    language: "ru",
    category: "generation",
    query: "Сделай короткий шаблон благодарности после встречи.",
    expectedSources: [],
  },
  {
    id: "amb-gen-04",
    language: "ru",
    category: "generation",
    query: "Переведи на английский: «Пожалуйста, пришлите недостающие документы».",
    expectedSources: [],
  },
  {
    id: "amb-gen-cli-01",
    language: "ru",
    category: "multi",
    query: "Напиши Марии письмо и укажи её текущий статус из CRM.",
    expectedSources: ["clients"],
  },

  // Desk / Formgrid
  {
    id: "amb-desk-01",
    language: "ru",
    category: "emigrant_desk",
    query: "Какой текущий статус дела в кабинете Emigrant?",
    expectedSources: ["emigrant_desk"],
  },
  {
    id: "amb-desk-02",
    language: "ru",
    category: "emigrant_desk",
    query: "ВНЖ по делу уже отмечен как одобренный в desk?",
    expectedSources: ["emigrant_desk"],
  },
  {
    id: "amb-fg-01",
    language: "ru",
    category: "formgrid",
    query: "Покажи свежие заявки из анкет за сегодня.",
    expectedSources: ["formgrid"],
  },
  {
    id: "amb-fg-02",
    language: "en",
    category: "formgrid",
    query: "Any new Formgrid leads waiting for review?",
    expectedSources: ["formgrid"],
  },

  // Ambiguous / conversational
  {
    id: "amb-x-01",
    language: "ru",
    category: "knowledge_base",
    query: "А если человек фрилансер — какие условия обычно?",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "amb-x-02",
    language: "ru",
    category: "knowledge_base",
    query: "Нужен ли апостиль на диплом для этой программы?",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "amb-x-03",
    language: "en",
    category: "knowledge_base",
    query: "Do we usually need proof of remote employment contract?",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "amb-x-04",
    language: "ru",
    category: "clients",
    query: "У кого из клиентов просрочен букинг на этой неделе?",
    expectedSources: ["clients"],
  },
  {
    id: "amb-x-05",
    language: "ru",
    category: "emigrant_drive",
    query: "Посмотри сканы паспорта у клиента Никитина.",
    expectedSources: ["clients", "emigrant_drive"],
  },
  {
    id: "amb-x-06",
    language: "en",
    category: "generation",
    query: "Polish this paragraph so it sounds more professional.",
    expectedSources: [],
  },
  {
    id: "amb-x-07",
    language: "ru",
    category: "multi",
    query: "Исходя из загруженного у Татьяны и требований программы — что ещё нужно?",
    expectedSources: ["clients", "emigrant_drive", "knowledge_base"],
  },
  {
    id: "amb-x-08",
    language: "ru",
    category: "knowledge_base",
    query: "Можно ли подаваться, если доход идёт от нескольких заказчиков?",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "amb-x-09",
    language: "en",
    category: "clients",
    query: "Who is the manager for client Sokolova?",
    expectedSources: ["clients"],
  },
  {
    id: "amb-x-10",
    language: "ru",
    category: "formgrid",
    query: "Есть ли новые лиды из формы, которых ещё не разобрали?",
    expectedSources: ["formgrid"],
  },
  {
    id: "amb-x-11",
    language: "ru",
    category: "emigrant_desk",
    query: "Проверь статус в кабинете по делу № thr-2241.",
    expectedSources: ["emigrant_desk"],
  },
  {
    id: "amb-x-12",
    language: "en",
    category: "knowledge_base",
    query: "What's the usual validity period of the permit after approval?",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "amb-x-13",
    language: "ru",
    category: "generation",
    query: "Напиши нейтральное напоминание без привязки к конкретному человеку.",
    expectedSources: [],
  },
  {
    id: "amb-x-14",
    language: "ru",
    category: "clients",
    query: "Покажи всех клиентов из Испании в таблице.",
    expectedSources: ["clients"],
  },
  {
    id: "amb-x-15",
    language: "en",
    category: "multi",
    query: "Draft a note to Ivan listing missing uploads versus the program checklist.",
    expectedSources: ["clients", "emigrant_drive", "knowledge_base"],
  },
  {
    id: "amb-x-16",
    language: "ru",
    category: "knowledge_base",
    query: "Какие основания чаще всего используем для семейной подачи?",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "amb-x-17",
    language: "ru",
    category: "emigrant_drive",
    query: "Лежит ли в Drive подтверждение адреса у Петра Орлова?",
    expectedSources: ["clients", "emigrant_drive"],
  },
  {
    id: "amb-x-18",
    language: "en",
    category: "clients",
    query: "Find booking address for client with phone ending 7842.",
    expectedSources: ["clients"],
  },
  {
    id: "amb-x-19",
    language: "ru",
    category: "knowledge_base",
    query: "Что отвечать, если спрашивают про минимальный доход заявителя?",
    expectedSources: ["knowledge_base"],
  },
  {
    id: "amb-x-20",
    language: "ru",
    category: "multi",
    query: "Сопоставь документы Дмитрия с чеклистом digital nomad и скажи, чего нет.",
    expectedSources: ["clients", "emigrant_drive", "knowledge_base"],
  },
  {
    id: "amb-x-21",
    language: "en",
    category: "knowledge_base",
    query: "Is private health insurance enough for the application packet?",
    expectedSources: ["knowledge_base"],
    forbiddenSources: ["emigrant_drive"],
  },
];

export function summarizeAi04Categories() {
  /** @type {Record<string, number>} */
  const out = {};
  for (const c of AI04_AMBIGUOUS_CASES) {
    out[c.category] = (out[c.category] ?? 0) + 1;
  }
  return out;
}
