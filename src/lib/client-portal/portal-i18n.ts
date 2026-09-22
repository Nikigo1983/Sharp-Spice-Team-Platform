import type { ClientPortalLocale } from "./types";
import { isClientPortalLocale } from "./types";
import type { ProcessStatusValue } from "./process-status";
import { PROCESS_STATUS_OPTIONS } from "./process-status";

export const CLIENT_LOCALE_COOKIE = "ss_client_locale";

export type PortalMsg =
  | "portalTitle"
  | "portalLoginSubtitle"
  | "password"
  | "signIn"
  | "signingIn"
  | "forgotPassword"
  | "noAccount"
  | "enterEmailPassword"
  | "invalidCredentials"
  | "hello"
  | "welcomeLead"
  | "welcomeLead2"
  | "signOut"
  | "questionnaire"
  | "questionnaireSubmitted"
  | "questionnairePickCountry"
  | "questionnaireProgress"
  | "openQuestionnaire"
  | "startQuestionnaire"
  | "continueQuestionnaire"
  | "processStatus"
  | "processStatusLabel"
  | "updated"
  | "assistant"
  | "assistantSoon"
  | "comingSoon"
  | "language"
  | "langRu"
  | "langEn"
  | "forgotTitle"
  | "forgotSubtitle"
  | "sendLink"
  | "sending"
  | "enterEmail"
  | "backToLogin"
  | "mailSentTitle"
  | "mailSentBody"
  | "resetTitle"
  | "resetSubtitle"
  | "newPassword"
  | "confirmPassword"
  | "savePassword"
  | "saving"
  | "passwordChangedTitle"
  | "passwordChangedBody"
  | "loginToPortal"
  | "invalidResetLink"
  | "requestNewReset"
  | "passwordTooShort"
  | "passwordsMismatch"
  | "invalidReset"
  | "inviteInvalid"
  | "inviteUsed"
  | "emailTaken"
  | "createAccount"
  | "creating"
  | "countryPickerTitle"
  | "countryPickerLead"
  | "countryPickerQuestion"
  | "countryPickerHint"
  | "loadingQuestionnaire"
  | "back"
  | "save"
  | "savingAnswers"
  | "submitQuestionnaire"
  | "submitting"
  | "submittedReadonly"
  | "fillLatin"
  | "yes"
  | "no"
  | "selectFile"
  | "uploading"
  | "remove"
  | "allowedFormats"
  | "maxSizeMb"
  | "saveDraftFirst"
  | "fileTooLarge"
  | "unsupportedFileType"
  | "revisionConflict"
  | "uploadFailed"
  | "countryLocked"
  | "missingRequired"
  | "fillRequired"
  | "next"
  | "privacyTitle"
  | "privacyBack";

const MESSAGES: Record<PortalMsg, { ru: string; en: string }> = {
  portalTitle: {
    ru: "Клиентский портал",
    en: "Client portal",
  },
  portalLoginSubtitle: {
    ru: "Вход для клиентов {brand}.",
    en: "Sign in for {brand} clients.",
  },
  password: { ru: "Пароль", en: "Password" },
  signIn: { ru: "Войти", en: "Sign in" },
  signingIn: { ru: "Вход…", en: "Signing in…" },
  forgotPassword: { ru: "Забыли пароль?", en: "Forgot password?" },
  noAccount: {
    ru: "Нет аккаунта? Используйте письмо-приглашение от менеджера.",
    en: "No account? Use the invitation email from your manager.",
  },
  enterEmailPassword: {
    ru: "Введите email и пароль.",
    en: "Enter email and password.",
  },
  invalidCredentials: {
    ru: "Неверный email или пароль.",
    en: "Incorrect email or password.",
  },
  hello: { ru: "Здравствуйте, {name}", en: "Hello, {name}" },
  welcomeLead: {
    ru: "Вас приветствует Клиентский портал {brand}.",
    en: "Welcome to the {brand} Client Portal.",
  },
  welcomeLead2: {
    ru: "Это ваш личный кабинет.",
    en: "This is your personal account.",
  },
  signOut: { ru: "Выйти", en: "Log out" },
  questionnaire: { ru: "Анкета", en: "Questionnaire" },
  questionnaireSubmitted: {
    ru: "Анкета отправлена. Вы можете просмотреть ответы.",
    en: "Questionnaire submitted. You can review your answers.",
  },
  questionnairePickCountry: {
    ru: "Выберите страну оформления ВНЖ и заполните анкету.",
    en: "Choose the country for your residence permit and fill in the questionnaire.",
  },
  questionnaireProgress: {
    ru: "Заполните анкету. Прогресс: {progress}%.",
    en: "Fill in the questionnaire. Progress: {progress}%.",
  },
  openQuestionnaire: { ru: "Открыть анкету", en: "Open questionnaire" },
  startQuestionnaire: {
    ru: "Начать заполнять анкету",
    en: "Start the questionnaire",
  },
  continueQuestionnaire: {
    ru: "Продолжить анкету",
    en: "Continue questionnaire",
  },
  processStatus: { ru: "Статус процесса", en: "Case status" },
  processStatusLabel: {
    ru: "Текущий статус вашего дела",
    en: "Current status of your case",
  },
  updated: { ru: "Обновлено:", en: "Updated:" },
  assistant: { ru: "Ассистент", en: "Assistant" },
  assistantSoon: {
    ru: "Клиентский AI-ассистент подключим после базового кабинета.",
    en: "The client AI assistant will be available after the basic account setup.",
  },
  comingSoon: { ru: "Скоро", en: "Coming soon" },
  language: { ru: "Язык", en: "Language" },
  langRu: { ru: "Русский", en: "Russian" },
  langEn: { ru: "English", en: "English" },
  forgotTitle: { ru: "Забыли пароль?", en: "Forgot password?" },
  forgotSubtitle: {
    ru: "Укажите email аккаунта клиентского портала {brand}. Если он есть в системе, мы отправим ссылку для сброса пароля.",
    en: "Enter the email for your {brand} client portal account. If it exists, we will send a password reset link.",
  },
  sendLink: { ru: "Отправить ссылку", en: "Send link" },
  sending: { ru: "Отправка…", en: "Sending…" },
  enterEmail: { ru: "Введите email.", en: "Enter your email." },
  backToLogin: { ru: "Вернуться ко входу", en: "Back to sign in" },
  mailSentTitle: { ru: "Письмо отправлено", en: "Email sent" },
  mailSentBody: {
    ru: "Проверьте вашу почту. Если во входящих нет письма, загляните в папку «Спам».",
    en: "Check your inbox. If you do not see the email, look in Spam.",
  },
  resetTitle: { ru: "Новый пароль", en: "New password" },
  resetSubtitle: {
    ru: "Задайте новый пароль для клиентского портала {brand}.",
    en: "Set a new password for the {brand} client portal.",
  },
  newPassword: { ru: "Новый пароль", en: "New password" },
  confirmPassword: { ru: "Повторите пароль", en: "Confirm password" },
  savePassword: { ru: "Сохранить пароль", en: "Save password" },
  saving: { ru: "Сохранение…", en: "Saving…" },
  passwordChangedTitle: { ru: "Пароль изменён", en: "Password changed" },
  passwordChangedBody: {
    ru: "Ваш пароль успешно изменён. Теперь можно войти в клиентский портал с новым паролем.",
    en: "Your password was changed successfully. You can now sign in with the new password.",
  },
  loginToPortal: { ru: "Войти в портал", en: "Sign in to the portal" },
  invalidResetLink: {
    ru: "Ссылка недействительна",
    en: "Invalid link",
  },
  requestNewReset: {
    ru: "Запросите новую ссылку для сброса пароля.",
    en: "Request a new password reset link.",
  },
  passwordTooShort: {
    ru: "Пароль должен быть не короче 8 символов.",
    en: "Password must be at least 8 characters.",
  },
  passwordsMismatch: {
    ru: "Пароли не совпадают.",
    en: "Passwords do not match.",
  },
  invalidReset: {
    ru: "Ссылка сброса недействительна или устарела.",
    en: "The reset link is invalid or expired.",
  },
  inviteInvalid: {
    ru: "Ссылка приглашения недействительна.",
    en: "Invitation link is invalid.",
  },
  inviteUsed: {
    ru: "Приглашение недействительно или уже использовано.",
    en: "Invitation is invalid or already used.",
  },
  emailTaken: {
    ru: "Аккаунт с этим email уже создан. Войдите в портал.",
    en: "An account with this email already exists. Please sign in.",
  },
  createAccount: { ru: "Создать аккаунт", en: "Create account" },
  creating: { ru: "Создание…", en: "Creating…" },
  countryPickerTitle: {
    ru: "Анкета для вида на жительство",
    en: "Residence permit questionnaire",
  },
  countryPickerLead: {
    ru: "Чтобы подобрать нужную анкету, укажите страну, для которой вы оформляете ВНЖ.",
    en: "To open the right questionnaire, choose the country for your residence permit.",
  },
  countryPickerQuestion: {
    ru: "Для какой страны вы оформляете вид на жительство?",
    en: "Which country are you applying for a residence permit in?",
  },
  countryPickerHint: {
    ru: "Выберите один вариант — откроется анкета именно для этой страны.",
    en: "Choose one option — the questionnaire for that country will open.",
  },
  loadingQuestionnaire: {
    ru: "Загрузка анкеты…",
    en: "Loading questionnaire…",
  },
  back: { ru: "Назад", en: "Back" },
  save: { ru: "Сохранить", en: "Save" },
  savingAnswers: { ru: "Сохранение…", en: "Saving…" },
  submitQuestionnaire: { ru: "Отправить анкету", en: "Submit questionnaire" },
  submitting: { ru: "Отправка…", en: "Submitting…" },
  submittedReadonly: {
    ru: "Анкета отправлена. Изменения недоступны.",
    en: "Questionnaire submitted. Editing is disabled.",
  },
  fillLatin: {
    ru: "Пожалуйста, заполните латиницей",
    en: "Please fill this in using Latin characters",
  },
  yes: { ru: "Да", en: "Yes" },
  no: { ru: "Нет", en: "No" },
  selectFile: { ru: "Выбрать файл", en: "Choose file" },
  uploading: { ru: "Загрузка…", en: "Uploading…" },
  remove: { ru: "Удалить", en: "Remove" },
  allowedFormats: {
    ru: "Допустимые форматы: {formats}",
    en: "Allowed formats: {formats}",
  },
  maxSizeMb: {
    ru: "Максимальный размер: {size} МБ",
    en: "Maximum size: {size} MB",
  },
  saveDraftFirst: {
    ru: "Сначала сохраните анкету и попробуйте снова",
    en: "Save the questionnaire first, then try again",
  },
  fileTooLarge: {
    ru: "Файл больше {size} МБ",
    en: "File is larger than {size} MB",
  },
  unsupportedFileType: {
    ru: "Недопустимый формат файла",
    en: "Unsupported file type",
  },
  revisionConflict: {
    ru: "Анкета изменилась. Обновите страницу.",
    en: "The questionnaire changed. Please refresh the page.",
  },
  uploadFailed: {
    ru: "Не удалось загрузить файл",
    en: "Could not upload the file",
  },
  countryLocked: {
    ru: "Страну нельзя сменить после начала заполнения.",
    en: "Country cannot be changed after you start filling the form.",
  },
  missingRequired: {
    ru: "Заполните обязательные поля",
    en: "Please fill in the required fields",
  },
  fillRequired: {
    ru: "Заполните обязательные поля перед отправкой.",
    en: "Fill in the required fields before submitting.",
  },
  next: { ru: "Далее", en: "Next" },
  privacyTitle: { ru: "Политика конфиденциальности", en: "Privacy policy" },
  privacyBack: { ru: "Назад в кабинет", en: "Back to account" },
};

const PROCESS_STATUS_EN: Record<ProcessStatusValue, string> = {
  "Заявка, форма и документы получены":
    "Application, form and documents received",
  "Документы на проверке": "Documents under review",
  "Оплата получена": "Payment received",
  "Документы переданы судебному переводчику":
    "Documents sent to court translator",
  "Переводы получены": "Translations received",
  "Заявка подана": "Application filed",
  "Назначен куратор-референт": "Case curator assigned",
  "Документы переданы миграционному адвокату":
    "Documents sent to immigration lawyer",
  "Проверка адреса": "Address check",
  "Отчёт по адресу отправлен": "Address report sent",
  "Проверка службы безопасности": "Security service check",
  "Отчёт службы безопасности отправлен": "Security service report sent",
  "Ожидание от службы безопасности": "Waiting for security service",
  "Отчёты переданы куратору": "Reports sent to curator",
  "Куратор инициировал новую проверку адреса":
    "Curator started a new address check",
  "Финальный пакет документов передан куратору":
    "Final document package sent to curator",
  "Гос. пошлина за одобрение оплачена": "Approval state fee paid",
  "Ожидание одобрения": "Awaiting approval",
  "ВНЖ одобрен": "Residence permit approved",
  "Подтверждение отправлено в консульство":
    "Confirmation sent to the consulate",
  "Документы поданы на визу D": "Documents submitted for D visa",
  "Виза D одобрена": "D visa approved",
  "Виза D не одобрена": "D visa not approved",
  "Регистрация адреса": "Address registration",
  "Сдача биометрии": "Biometrics appointment",
  "Получение пластиковой карты": "Collecting plastic residence card",
};

export function normalizeClientLocale(
  value: string | null | undefined,
): ClientPortalLocale {
  if (value === "en" || value === "ru") return value;
  return "ru";
}

export function t(
  key: PortalMsg,
  locale: ClientPortalLocale,
  vars?: Record<string, string | number>,
): string {
  let text = MESSAGES[key][locale] ?? MESSAGES[key].ru;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

export function translateProcessStatus(
  value: string,
  locale: ClientPortalLocale,
): string {
  if (locale !== "en") return value;
  if ((PROCESS_STATUS_OPTIONS as readonly string[]).includes(value)) {
    return PROCESS_STATUS_EN[value as ProcessStatusValue] ?? value;
  }
  return value;
}
