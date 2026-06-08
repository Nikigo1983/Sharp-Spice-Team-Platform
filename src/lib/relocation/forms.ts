export type RelocationResourceType =
  | "form"
  | "formgrid"
  | "app"
  | "sheets"
  | "website"
  | "telegram";

export type RelocationResource = {
  id: string;
  type: RelocationResourceType;
  title: string;
  description: string;
  country: string;
  audience: string;
  url: string;
  icon: string;
  actionLabel: string;
};

export type RelocationSection = {
  id: string;
  title: string;
  subtitle?: string;
  items: RelocationResource[];
};

/** Анкета Formgrid — для клиентов */
export const CROATIA_DIGITAL_NOMAD_FORM_URL =
  "https://share.formgrid.com/KB6n6nNQ8I8i0U5E";

/** Кабинет Emigrant Croatia Desk (админка) */
export const EMIGRANT_CROATIA_APP_URL =
  "https://emigrant-croatia-desk.vercel.app/admin";

/** Formgrid — рабочее место администраторов (ответы анкеты) */
export const CROATIA_FORMGRID_RESULTS_URL =
  "https://app.formgrid.com/forms/YzxaL2TnWc6lMhQM/results";

/** Ответы анкеты Formgrid → Google Sheets */
export const CROATIA_FORMGRID_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1S8Y0VCaAQ78wxg5Rxl8fcFMkwSsvr-X-cLrAlK4nF9Q/edit?gid=0#gid=0";

export const CROATIA_FORMGRID_SHEET_ID =
  "1S8Y0VCaAQ78wxg5Rxl8fcFMkwSsvr-X-cLrAlK4nF9Q";

/** Основная таблица — все клиенты Хорватии и статусы дел */
export const CROATIA_CLIENTS_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/138W2nHQcJu_xRsI2RBqeD6Oq8Tg9FbKH/edit?gid=1431336126#gid=1431336126";

export const CROATIA_CLIENTS_SHEET_ID = "138W2nHQcJu_xRsI2RBqeD6Oq8Tg9FbKH";

/** Сайт Emigrant-SK — программы по Европе */
export const EMIGRANT_SK_WEBSITE_URL = "https://emigrant-sk.com/";

/** Telegram-канал Emigrant | ВНЖ Европа */
export const EMIGRANT_TELEGRAM_URL = "https://t.me/emigrant_eu";

const CROATIA_RESOURCES: RelocationResource[] = [
  {
    id: "croatia-clients-sheet",
    type: "sheets",
    title: "Клиенты Хорватия",
    description:
      "Основная таблица: полные данные по клиентам, даты подачи и одобрения, букинг, кураторы, заметки и пароли для приложения.",
    country: "Хорватия",
    audience: "Основная таблица",
    url: CROATIA_CLIENTS_SHEET_URL,
    icon: "fa-solid fa-table-cells",
    actionLabel: "Открыть таблицу",
  },
  {
    id: "croatia-digital-nomad-form",
    type: "form",
    title: "Анкета для цифровых кочевников в Хорватии",
    description:
      "Клиентская анкета Formgrid. Отправьте ссылку клиенту или заполните вместе на созвоне.",
    country: "Хорватия",
    audience: "Для клиентов",
    url: CROATIA_DIGITAL_NOMAD_FORM_URL,
    icon: "fa-solid fa-clipboard-list",
    actionLabel: "Открыть анкету",
  },
  {
    id: "croatia-formgrid-results",
    type: "formgrid",
    title: "Formgrid — ответы анкеты",
    description:
      "Рабочее место администраторов Formgrid: все ответы клиентов из анкеты появляются здесь автоматически.",
    country: "Хорватия",
    audience: "Админы Formgrid",
    url: CROATIA_FORMGRID_RESULTS_URL,
    icon: "fa-solid fa-chart-column",
    actionLabel: "Открыть Formgrid",
  },
  {
    id: "croatia-emigrant-app",
    type: "app",
    title: "Приложение Emigrant Croatia Desk",
    description:
      "Внутренний кабинет по кейсам Хорватии: клиенты, статусы и работа команды. Вход выдаёт администратор.",
    country: "Хорватия",
    audience: "Для команды",
    url: EMIGRANT_CROATIA_APP_URL,
    icon: "fa-solid fa-laptop",
    actionLabel: "Открыть приложение",
  },
  {
    id: "croatia-formgrid-sheet",
    type: "sheets",
    title: "Таблица ответов анкеты",
    description:
      "Google Sheets — сюда автоматически попадают ответы клиентов из анкеты Formgrid. Используйте для проверки данных и CRM.",
    country: "Хорватия",
    audience: "Данные анкет",
    url: CROATIA_FORMGRID_SHEET_URL,
    icon: "fa-solid fa-table",
    actionLabel: "Открыть таблицу",
  },
];

const EMIGRANT_EU_RESOURCES: RelocationResource[] = [
  {
    id: "emigrant-sk-website",
    type: "website",
    title: "Emigrant-SK — сайт",
    description:
      "ВНЖ и эмиграция в Европу: Словакия, Хорватия, Испания, Португалия и другие направления. Программы, документы, новости.",
    country: "Европа",
    audience: "Публичный сайт",
    url: EMIGRANT_SK_WEBSITE_URL,
    icon: "fa-solid fa-globe",
    actionLabel: "Открыть сайт",
  },
  {
    id: "emigrant-telegram",
    type: "telegram",
    title: "Telegram — Emigrant | ВНЖ Европа",
    description:
      "Канал @emigrant_eu: ВНЖ без «сказок», Словакия, Хорватия, Испания, Португалия — учёба, работа, nomad, пассивный доход.",
    country: "Европа",
    audience: "@emigrant_eu",
    url: EMIGRANT_TELEGRAM_URL,
    icon: "fa-brands fa-telegram",
    actionLabel: "Открыть канал",
  },
];

export const RELOCATION_SECTIONS: RelocationSection[] = [
  {
    id: "croatia",
    title: "Хорватия",
    subtitle:
      "Таблица клиентов, анкета, Formgrid, ответы анкеты и внутренний кабинет",
    items: CROATIA_RESOURCES,
  },
  {
    id: "emigrant-eu",
    title: "Emigrant — Европа",
    subtitle: "Сайт, программы по странам и Telegram-канал",
    items: EMIGRANT_EU_RESOURCES,
  },
];

export const RELOCATION_RESOURCES: RelocationResource[] =
  RELOCATION_SECTIONS.flatMap((section) => section.items);

/** @deprecated используйте RELOCATION_RESOURCES */
export const RELOCATION_FORMS = RELOCATION_RESOURCES;
