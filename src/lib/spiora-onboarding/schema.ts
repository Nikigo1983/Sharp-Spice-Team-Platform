export const SPIORA_ONBOARDING_PUBLIC_PATH = "/s/spiora-onboarding";

export const SPIORA_ONBOARDING_STAFF_TITLE =
  "Анкета для нового клиента SPIORA по внедрению платформы";

export const SPIORA_ONBOARDING_CLIENT_INTRO = {
  greeting: "Добрый день!",
  lead: "Анкета адаптации платформы SPIORA под вашу компанию.",
  body: "Отметьте нужные варианты; где можно — несколько. Свободный текст — только где нужно. Ссылки на файлы и материалы укажите в соответствующих полях.",
  duration: "Заполнение займёт около 15–25 минут.",
} as const;

export const SPIORA_ONBOARDING_THANKS =
  "Спасибо! Анкета принята. Мы используем ваши ответы, чтобы подготовить адаптацию SPIORA под вашу компанию.";

export type OnboardingOption = { id: string; label: string };

export type OnboardingFieldType =
  | "text"
  | "textarea"
  | "date"
  | "single"
  | "multi"
  | "yes_no";

export type OnboardingField = {
  id: string;
  type: OnboardingFieldType;
  label: string;
  section: string;
  hint?: string;
  required?: boolean;
  options?: OnboardingOption[];
  allowOther?: boolean;
  placeholder?: string;
};

function o(id: string, label: string): OnboardingOption {
  return { id, label };
}

export const SPIORA_ONBOARDING_FIELDS: OnboardingField[] = [
  // 0. Статус проекта
  {
    id: "filled_at",
    type: "date",
    section: "0. Статус проекта",
    label: "Дата заполнения",
    required: true,
  },
  {
    id: "filler_role",
    type: "multi",
    section: "0. Статус проекта",
    label: "Кто заполняет",
    required: true,
    allowOther: true,
    options: [
      o("owner", "Собственник"),
      o("ceo", "CEO/COO"),
      o("it", "IT"),
      o("marketing", "Маркетинг"),
      o("ops", "Операции"),
    ],
  },
  {
    id: "readiness",
    type: "single",
    section: "0. Статус проекта",
    label: "Готовность",
    required: true,
    options: [
      o("exploring", "Изучаем"),
      o("pilot", "Пилот 1–3 мес."),
      o("prod", "Запуск в прод"),
      o("deadline", "Есть жёсткий срок"),
    ],
  },
  {
    id: "go_live",
    type: "single",
    section: "0. Статус проекта",
    label: "Желаемый go-live",
    required: true,
    options: [
      o("asap", "ASAP"),
      o("2_4w", "2–4 нед."),
      o("1_2m", "1–2 мес."),
      o("3m_plus", "3+ мес."),
      o("unknown", "Не определили"),
    ],
  },

  // 1. Компания и контакты
  {
    id: "company_legal",
    type: "text",
    section: "1. Компания и контакты",
    label: "Полное юридическое название",
    required: true,
  },
  {
    id: "company_brand",
    type: "text",
    section: "1. Компания и контакты",
    label: "Торговое / бренд-имя",
  },
  {
    id: "company_ui_name",
    type: "single",
    section: "1. Компания и контакты",
    label: "Как писать название в интерфейсе",
    allowOther: true,
    options: [
      o("brand", "= бренд"),
      o("legal", "= юрлицо"),
      o("product", "Отдельное имя продукта"),
    ],
  },
  {
    id: "company_country",
    type: "text",
    section: "1. Компания и контакты",
    label: "Страна / юрисдикция",
  },
  {
    id: "company_city",
    type: "text",
    section: "1. Компания и контакты",
    label: "Город",
  },
  {
    id: "company_site",
    type: "text",
    section: "1. Компания и контакты",
    label: "Сайт",
    placeholder: "https://",
  },
  {
    id: "company_support_email",
    type: "text",
    section: "1. Компания и контакты",
    label: "Email поддержки для клиентов",
  },
  {
    id: "company_phone",
    type: "text",
    section: "1. Компания и контакты",
    label: "Телефон (опционально)",
  },
  {
    id: "contact_name",
    type: "text",
    section: "1. Компания и контакты",
    label: "Основной контакт — ФИО",
    required: true,
  },
  {
    id: "contact_title",
    type: "text",
    section: "1. Компания и контакты",
    label: "Основной контакт — должность",
  },
  {
    id: "contact_email",
    type: "text",
    section: "1. Компания и контакты",
    label: "Основной контакт — email",
    required: true,
  },
  {
    id: "contact_messenger",
    type: "text",
    section: "1. Компания и контакты",
    label: "Telegram / WhatsApp / телефон",
  },
  {
    id: "contact_lang",
    type: "single",
    section: "1. Компания и контакты",
    label: "Язык общения с нашей командой",
    options: [
      o("ru", "Русский"),
      o("en", "English"),
      o("both", "Оба"),
    ],
  },
  {
    id: "contact_tz",
    type: "text",
    section: "1. Компания и контакты",
    label: "Часовой пояс",
    placeholder: "например, Europe/Zagreb",
  },
  {
    id: "comm_roles",
    type: "multi",
    section: "1. Компания и контакты",
    label: "Кто коммуницирует по платформе (роли)",
    hint: "Отметьте нужные роли; ФИО и контакты укажите ниже",
    options: [
      o("sponsor", "Спонсор проекта / владелец решения"),
      o("ops_owner", "Операционный владелец"),
      o("it", "IT / доступы / интеграции"),
      o("design", "Дизайн / бренд"),
      o("finance", "Финансы"),
      o("legal", "Юрист"),
      o("daily", "Ежедневный контакт"),
    ],
  },
  {
    id: "comm_people",
    type: "textarea",
    section: "1. Компания и контакты",
    label: "Контакты по ролям",
    hint: "ФИО, email, мессенджер для каждой отмеченной роли",
    placeholder: "Спонсор: ...\nОперации: ...",
  },
  {
    id: "decision_maker",
    type: "single",
    section: "1. Компания и контакты",
    label: "Кто принимает финальные решения?",
    allowOther: true,
    options: [
      o("owner", "Собственник"),
      o("sponsor", "Спонсор проекта"),
      o("collective", "Коллегиально"),
    ],
  },
  {
    id: "comm_channel",
    type: "multi",
    section: "1. Компания и контакты",
    label: "Канал связи с нами",
    allowOther: true,
    options: [
      o("email", "Email"),
      o("telegram", "Telegram"),
      o("whatsapp", "WhatsApp"),
      o("slack", "Slack"),
      o("calls", "Созвоны"),
    ],
  },

  // 2. Язык
  {
    id: "ui_lang",
    type: "single",
    section: "2. Язык платформы",
    label: "На каком языке хотите видеть платформу?",
    required: true,
    allowOther: true,
    options: [
      o("ru", "Русский"),
      o("en", "Английский"),
      o("both", "Оба (переключатель RU / EN)"),
    ],
  },
  {
    id: "ui_lang_default",
    type: "single",
    section: "2. Язык платформы",
    label: "Язык по умолчанию (если оба / несколько)",
    allowOther: true,
    options: [o("ru", "Русский"), o("en", "Английский")],
  },
  {
    id: "ui_lang_later",
    type: "text",
    section: "2. Язык платформы",
    label: "Нужны ли ещё языки позже?",
    placeholder: "Нет / Да: перечень",
  },
  {
    id: "email_lang",
    type: "single",
    section: "2. Язык платформы",
    label: "Язык писем клиентам",
    allowOther: true,
    options: [
      o("ui", "Как интерфейс"),
      o("ru", "Только русский"),
      o("en", "Только английский"),
      o("client", "На языке клиента"),
    ],
  },

  // 3. Бизнес
  {
    id: "biz_type",
    type: "multi",
    section: "3. Бизнес-контекст",
    label: "Чем занимается компания?",
    required: true,
    allowOther: true,
    options: [
      o("relocation", "Консалтинг (визы / релокация / иммиграция)"),
      o("legal", "Юридические услуги"),
      o("accounting", "Бухгалтерия / финансы для клиентов"),
      o("hr", "HR / рекрутинг"),
      o("real_estate", "Недвижимость"),
      o("education", "Образование / курсы"),
      o("it", "IT / услуги клиентам"),
      o("marketing", "Маркетинг / креатив"),
      o("holding", "Мультисервис / холдинг"),
    ],
  },
  {
    id: "client_type",
    type: "single",
    section: "3. Бизнес-контекст",
    label: "Кто ваши клиенты в системе?",
    options: [
      o("b2c", "Физлица (B2C)"),
      o("b2b", "Компании (B2B)"),
      o("both", "И то и другое"),
      o("internal", "Внутренние проекты без внешнего клиента"),
    ],
  },
  {
    id: "geo",
    type: "single",
    section: "3. Бизнес-контекст",
    label: "География",
    allowOther: true,
    options: [
      o("one_country", "Одна страна"),
      o("region", "Регион / несколько стран"),
      o("eu", "ЕС"),
      o("global", "Глобально"),
    ],
  },
  {
    id: "geo_countries",
    type: "text",
    section: "3. Бизнес-контекст",
    label: "Приоритетные страны (если важно)",
  },
  {
    id: "team_size",
    type: "single",
    section: "3. Бизнес-контекст",
    label: "Сотрудников в платформе",
    options: [
      o("1_5", "1–5"),
      o("6_15", "6–15"),
      o("16_50", "16–50"),
      o("50_plus", "50+"),
    ],
  },
  {
    id: "active_cases",
    type: "single",
    section: "3. Бизнес-контекст",
    label: "Активных клиентских дел",
    options: [
      o("lt50", "<50"),
      o("50_200", "50–200"),
      o("200_1000", "200–1000"),
      o("1000_plus", "1000+"),
    ],
  },
  {
    id: "currency",
    type: "single",
    section: "3. Бизнес-контекст",
    label: "Валюта учёта",
    allowOther: true,
    options: [o("eur", "EUR"), o("usd", "USD"), o("rub", "RUB")],
  },
  {
    id: "keep_tools",
    type: "multi",
    section: "3. Бизнес-контекст",
    label: "Что важно сохранить из текущих процессов?",
    allowOther: true,
    options: [
      o("email", "Email"),
      o("sheets", "Таблицы (Sheets/Excel)"),
      o("crm", "CRM"),
      o("calendar", "Календарь"),
      o("messengers", "Мессенджеры"),
      o("files", "Файловое хранилище"),
      o("accounting", "Бухгалтерия / 1С"),
      o("from_scratch", "Строим с нуля"),
    ],
  },

  // 4. Дизайн
  {
    id: "brand_files",
    type: "textarea",
    section: "4. Дизайн и бренд",
    label: "Материалы и ссылка на папку с файлами",
    hint: "Лого, compact, favicon, брендбук, презентация, шрифты — что есть и ссылка на папку",
    placeholder: "Ссылка: ...\nЛого: есть / нет / позже\n...",
  },
  {
    id: "ui_theme",
    type: "single",
    section: "4. Дизайн и бренд",
    label: "Тема интерфейса",
    options: [
      o("dark", "Тёмная"),
      o("light", "Светлая"),
      o("both", "Обе + переключатель"),
      o("brandbook", "По брендбуку"),
    ],
  },
  {
    id: "colors",
    type: "textarea",
    section: "4. Дизайн и бренд",
    label: "Цвета",
    hint: "Из брендбука или hex: фон, акцент 1–2, текст, успех/ошибка, градиент",
  },
  {
    id: "fonts",
    type: "textarea",
    section: "4. Дизайн и бренд",
    label: "Шрифты и иконки",
    hint: "UI, заголовки, бренд/слоган, иконки",
  },
  {
    id: "slogan",
    type: "text",
    section: "4. Дизайн и бренд",
    label: "Слоган (login / splash)",
    placeholder: "Свой / без слогана / предложите",
  },
  {
    id: "positioning",
    type: "text",
    section: "4. Дизайн и бренд",
    label: "Позиционирование (1 фраза)",
  },
  {
    id: "portal_name",
    type: "single",
    section: "4. Дизайн и бренд",
    label: "Название клиентского кабинета",
    allowOther: true,
    options: [
      o("brand_client", "[Бренд] Client"),
      o("lk", "Личный кабинет"),
    ],
  },
  {
    id: "tone",
    type: "single",
    section: "4. Дизайн и бренд",
    label: "Тон писем / уведомлений",
    options: [
      o("formal", "Формальный"),
      o("friendly", "Дружелюбный"),
      o("neutral", "Нейтральный деловой"),
    ],
  },
  {
    id: "company_card",
    type: "multi",
    section: "4. Дизайн и бренд",
    label: "Карточка компании в системе",
    options: [
      o("send", "Заполним и пришлём данные"),
      o("self", "Заполним сами после доступа"),
      o("later", "Позже"),
      o("address", "Юр. адрес"),
      o("vat", "VAT / ИНН"),
      o("bank", "Банк / IBAN"),
      o("ceo", "Руководитель"),
      o("docs", "Блок для документов"),
    ],
  },

  // 5. Роли
  {
    id: "roles_needed",
    type: "multi",
    section: "5. Сотрудники и роли",
    label: "Какие роли нужны",
    allowOther: true,
    options: [
      o("admin", "Администратор"),
      o("manager", "Менеджер / операции"),
      o("finance", "Финансы / бухгалтер"),
      o("specialist", "Специалист / консультант"),
      o("viewer", "Только просмотр"),
    ],
  },
  {
    id: "roles_access",
    type: "textarea",
    section: "5. Сотрудники и роли",
    label: "Доступ к разделам",
    hint: "Кратко: какие модули видит админ / менеджер / финансы / специалист / просмотр",
  },
  {
    id: "security",
    type: "multi",
    section: "5. Сотрудники и роли",
    label: "Безопасность сотрудников",
    options: [
      o("mfa_all", "MFA обязательна для всех"),
      o("mfa_admin_finance", "MFA только для админа и финансов"),
      o("mfa_optional", "MFA по желанию"),
      o("sso_interest", "SSO интересно позже"),
      o("sso_no", "SSO не нужно"),
      o("password_strong", "Усиленная политика паролей"),
    ],
  },

  // 6. Модули
  {
    id: "mod_dashboard",
    type: "single",
    section: "6. Модули платформы",
    label: "Главная / дашборд",
    options: [
      o("need", "Нужен"),
      o("pilot", "Пилот"),
      o("no", "Не нужен"),
    ],
  },
  {
    id: "mod_dashboard_opts",
    type: "multi",
    section: "6. Модули платформы",
    label: "Дашборд — что показывать",
    allowOther: true,
    options: [
      o("day", "Сводка дня"),
      o("overdue", "Просроченные задачи"),
      o("meetings", "Ближайшие встречи"),
      o("ai", "Быстрые вопросы к AI"),
      o("news", "Briefing / новости"),
      o("kpi", "KPI"),
    ],
  },
  {
    id: "mod_crm",
    type: "single",
    section: "6. Модули платформы",
    label: "Клиентская база (CRM)",
    options: [
      o("need", "Нужен"),
      o("pilot", "Пилот"),
      o("no", "Не нужен"),
    ],
  },
  {
    id: "crm_entity",
    type: "single",
    section: "6. Модули платформы",
    label: "«Клиент» у вас — это",
    options: [
      o("person", "Человек"),
      o("company", "Компания"),
      o("case", "Дело / кейс"),
      o("project", "Проект"),
      o("family", "Семья / группа"),
    ],
  },
  {
    id: "crm_fields",
    type: "multi",
    section: "6. Модули платформы",
    label: "В карточке обязательно",
    allowOther: true,
    options: [
      o("profile", "Профиль / контакты"),
      o("notes", "Заметки"),
      o("docs", "Документы"),
      o("tasks", "Задачи"),
      o("finance", "Финансы"),
      o("ai", "AI по делу"),
      o("meetings", "История встреч"),
      o("status", "Статус / воронка"),
      o("service", "Услуга / направление"),
    ],
  },
  {
    id: "mod_invites",
    type: "single",
    section: "6. Модули платформы",
    label: "Приглашения клиентов в кабинет",
    options: [
      o("need", "Нужны"),
      o("pilot", "Пилот"),
      o("no", "Не нужны"),
    ],
  },
  {
    id: "mod_questionnaire",
    type: "single",
    section: "6. Модули платформы",
    label: "Анкета / онбординг клиента",
    options: [
      o("need", "Нужна"),
      o("pilot", "Пилот"),
      o("no", "Не нужна"),
    ],
  },
  {
    id: "questionnaire_blocks",
    type: "multi",
    section: "6. Модули платформы",
    label: "Блоки анкеты клиента",
    allowOther: true,
    options: [
      o("hello", "Приветствие"),
      o("personal", "Личные данные"),
      o("contacts", "Контакты"),
      o("family", "Семья"),
      o("education", "Образование"),
      o("work", "Работа"),
      o("goals", "Цели / история"),
      o("docs", "Загрузка документов"),
      o("consents", "Согласия"),
      o("contract", "Блок договора"),
      o("custom", "Полностью своя структура"),
    ],
  },
  {
    id: "mod_portal",
    type: "single",
    section: "6. Модули платформы",
    label: "Клиентский кабинет",
    options: [
      o("need", "Нужен"),
      o("pilot", "Пилот"),
      o("no", "Не нужен"),
    ],
  },
  {
    id: "portal_features",
    type: "multi",
    section: "6. Модули платформы",
    label: "Клиентский кабинет — функции",
    options: [
      o("status", "Статус дела"),
      o("form", "Анкета"),
      o("contract", "Договор / подписание"),
      o("privacy", "Политика ПДн"),
      o("ai", "AI-ассистент"),
      o("docs", "Загрузка документов"),
      o("kb", "База материалов"),
      o("pay", "Оплата / счета"),
      o("chat", "Чат с менеджером"),
      o("mfa", "MFA для клиентов"),
    ],
  },
  {
    id: "mod_tasks",
    type: "single",
    section: "6. Модули платформы",
    label: "Задачи",
    options: [
      o("need", "Нужны"),
      o("pilot", "Пилот"),
      o("no", "Не нужны"),
    ],
  },
  {
    id: "mod_calendar",
    type: "single",
    section: "6. Модули платформы",
    label: "Календарь и видеовстречи",
    options: [
      o("need", "Нужны"),
      o("pilot", "Пилот"),
      o("no", "Не нужны"),
    ],
  },
  {
    id: "mod_chat",
    type: "single",
    section: "6. Модули платформы",
    label: "Командный чат",
    options: [
      o("need", "Нужен"),
      o("pilot", "Пилот"),
      o("no", "Не нужен"),
    ],
  },
  {
    id: "mod_kb",
    type: "multi",
    section: "6. Модули платформы",
    label: "Базы знаний",
    options: [
      o("staff_need", "Для сотрудников — нужна"),
      o("staff_pilot", "Для сотрудников — пилот"),
      o("client_need", "Для клиентов — нужна"),
      o("client_pilot", "Для клиентов — пилот"),
      o("empty", "Контент: пусто"),
      o("migrate", "Миграция из Notion/Confluence/Drive"),
      o("help", "Помощь со структурой"),
    ],
  },
  {
    id: "mod_ai",
    type: "single",
    section: "6. Модули платформы",
    label: "AI",
    options: [
      o("need", "Нужен"),
      o("pilot", "Пилот"),
      o("no", "Не нужен"),
    ],
  },
  {
    id: "ai_details",
    type: "textarea",
    section: "6. Модули платформы",
    label: "AI — имя, источники, ограничения",
  },
  {
    id: "mod_resources",
    type: "single",
    section: "6. Модули платформы",
    label: "Библиотека внешних ресурсов",
    allowOther: true,
    options: [o("need", "Нужна"), o("no", "Не нужна")],
  },
  {
    id: "mod_finance",
    type: "single",
    section: "6. Модули платформы",
    label: "Финансы",
    options: [
      o("need", "Нужны"),
      o("pilot", "Пилот"),
      o("later", "Позже"),
      o("no", "Не нужны"),
    ],
  },
  {
    id: "mod_analytics",
    type: "single",
    section: "6. Модули платформы",
    label: "Аналитика",
    options: [
      o("need", "Нужна"),
      o("pilot", "Пилот"),
      o("no", "Не нужна"),
    ],
  },
  {
    id: "mod_team_settings",
    type: "multi",
    section: "6. Модули платформы",
    label: "Команда и настройки",
    options: [
      o("team", "Управление сотрудниками / инвайты"),
      o("company", "Настройки компании в UI"),
      o("lang", "Язык и внешний вид"),
      o("integrations_show", "Интеграции — показать клиенту"),
      o("integrations_hide", "Интеграции — скрыть"),
      o("integrations_us", "Интеграции — только вашей команде"),
    ],
  },
  {
    id: "mod_notifications",
    type: "multi",
    section: "6. Модули платформы",
    label: "Уведомления",
    options: [
      o("inapp", "В приложении"),
      o("email", "Email"),
      o("desktop", "Desktop / PWA"),
      o("telegram", "Telegram-бот"),
      o("no_dup", "Не дублировать Slack/Telegram"),
    ],
  },
  {
    id: "mod_pwa",
    type: "single",
    section: "6. Модули платформы",
    label: "Установка как приложение (PWA)",
    options: [
      o("yes", "Да"),
      o("whatever", "Не важно"),
      o("mobile", "Только для мобильных сотрудников"),
    ],
  },

  // 7–8
  {
    id: "must_have",
    type: "multi",
    section: "7. Приоритеты запуска",
    label: "Must have в день 1 (6–8 пунктов)",
    options: [
      o("brand", "Бренд"),
      o("roles", "Логины и роли"),
      o("crm", "CRM"),
      o("tasks", "Задачи"),
      o("calendar", "Календарь/встречи"),
      o("portal", "Клиентский кабинет"),
      o("form", "Анкета"),
      o("contract", "Договор"),
      o("ai", "AI"),
      o("kb", "Базы знаний"),
      o("finance", "Финансы"),
      o("chat", "Чат"),
      o("analytics", "Аналитика"),
      o("migration", "Миграция данных"),
      o("lang", "Язык интерфейса"),
    ],
  },
  {
    id: "phase2",
    type: "textarea",
    section: "7. Приоритеты запуска",
    label: "Фаза 2",
  },
  {
    id: "scenarios",
    type: "multi",
    section: "8. Ключевые сценарии",
    label: "Ключевые сценарии",
    allowOther: true,
    options: [
      o("lead", "Лид → карточка → задачи"),
      o("invite", "Инвайт → анкета → разбор → дело"),
      o("call", "Созвон по ссылке (+ запись)"),
      o("weekly", "Еженедельный статус"),
      o("payments", "Контроль оплат"),
      o("kb", "База знаний для онбординга"),
      o("status", "Клиент видит статус и документы"),
      o("ai", "AI помогает менеджеру"),
    ],
  },

  // 9–11
  {
    id: "integrations",
    type: "textarea",
    section: "9. Интеграции и инфраструктура",
    label: "Интеграции",
    hint: "Google, Microsoft, SMTP/домен, видео, AI-ключ, CRM, webhooks, домен платформы, изоляция данных",
  },
  {
    id: "legal",
    type: "multi",
    section: "10. Юридика и комплаенс",
    label: "Юридика и комплаенс",
    allowOther: true,
    options: [
      o("contract", "Свой текст договора"),
      o("privacy", "Своя политика ПДн"),
      o("store_eu", "Хранение: ЕС"),
      o("store_ru", "Хранение: РФ"),
      o("store_advise", "Хранение: посоветуйте"),
      o("enterprise", "Enterprise-требования"),
      o("recording_consent", "Согласие на запись встреч"),
      o("no_recording", "Записей не будет"),
    ],
  },
  {
    id: "legal_notes",
    type: "textarea",
    section: "10. Юридика и комплаенс",
    label: "Срок хранения документов и комментарии",
  },
  {
    id: "training",
    type: "multi",
    section: "11. Обучение и контент",
    label: "Обучение и контент",
    options: [
      o("kickoff", "Kickoff 60–90 мин"),
      o("train", "Обучение команды"),
      o("screencasts", "Скринкасты / PDF"),
      o("demo_self", "Демо-данные заполним сами"),
      o("demo_domain", "Нужны примерные данные под наш домен"),
    ],
  },
  {
    id: "training_people",
    type: "text",
    section: "11. Обучение и контент",
    label: "Обучение — сколько человек",
  },

  // 12–13
  {
    id: "files_checklist",
    type: "multi",
    section: "12. Чеклист файлов",
    label: "Что приложите / пришлёте",
    options: [
      o("logo", "Логотип (светлый/тёмный)"),
      o("compact", "Compact logo / icon"),
      o("brandbook", "Брендбук / гайдлайн"),
      o("colors", "Цвета"),
      o("fonts", "Шрифты"),
      o("deck", "Презентация"),
      o("contract", "Договор"),
      o("privacy", "Политика ПДн"),
      o("form", "Структура анкеты"),
      o("staff", "Список сотрудников и ролей"),
      o("cases", "3–5 примеров кейсов"),
    ],
  },
  {
    id: "files_link",
    type: "text",
    section: "12. Чеклист файлов",
    label: "Ссылка на папку с материалами",
    placeholder: "https://...",
  },
  {
    id: "confirm_data",
    type: "yes_no",
    section: "13. Подтверждение",
    label: "Данные верны",
    required: true,
  },
  {
    id: "confirm_materials",
    type: "yes_no",
    section: "13. Подтверждение",
    label: "Материалы можно использовать для макета",
    required: true,
  },
  {
    id: "nda",
    type: "single",
    section: "13. Подтверждение",
    label: "NDA",
    options: [o("exists", "Уже есть"), o("need", "Нужен")],
  },
  {
    id: "comments",
    type: "textarea",
    section: "13. Подтверждение",
    label: "Комментарии",
  },
];

export function getOnboardingSections(): string[] {
  const sections: string[] = [];
  for (const field of SPIORA_ONBOARDING_FIELDS) {
    if (!sections.includes(field.section)) sections.push(field.section);
  }
  return sections;
}

export function optionLabel(
  field: OnboardingField,
  optionId: string,
): string {
  return field.options?.find((x) => x.id === optionId)?.label ?? optionId;
}
