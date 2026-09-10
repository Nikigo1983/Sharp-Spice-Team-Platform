/**
 * Official questionnaire / temporary-residence Q&A drafting for AI Workspace.
 * Produces first-person applicant answers that keep each question text,
 * grounded only in pasted notes / CLIENT CONTEXT / case memory.
 */

export const WORKSPACE_QUESTIONNAIRE_MAX_TOKENS = 4000;

const QUESTIONNAIRE_INTENT_RE =
  /ответь\s+на\s+вопрос|ответы\s+на\s+вопрос|составь\s+ответ|составить\s+ответ|заполни\s+ответ|please\s+answer\s+each|retain\s+the\s+text\s+of\s+the\s+question|temporary\s+residence\s+permit|digital\s+nomad\s+status|place\s+and\s+date\s+of\s+signing|город[, ]\s*дат|подпись\s+поставить|вопросы\s+нов|для\s+мазурин|questionnaire\s+answers?|оформи\s+(?:ответ|как\s+документ)|живым\s+язык/i;

const HAS_NUMBERED_OFFICIAL_QUESTIONS_RE =
  /(?:^|\n)\s*1\.\s*.{10,}(?:chose|residence|employment|Croatia|выбрал|Хорват)/im;

const HAS_ENGLISH_FORM_MARKERS_RE =
  /Please explain why you chose|Have you previously held a temporary residence|Which countries have you visited|Please indicate the place and date of signing/i;

const HAS_RUSSIAN_FORM_MARKERS_RE =
  /Пожалуйста,? объясните,? почему|Выдавалась ли вам ранее виза|В каких странах вы (?:были|находились)|укажите место и дату подписания/i;

export function isQuestionnaireAnswerIntent(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 40) return false;
  if (HAS_ENGLISH_FORM_MARKERS_RE.test(trimmed)) return true;
  if (HAS_RUSSIAN_FORM_MARKERS_RE.test(trimmed)) return true;
  if (
    QUESTIONNAIRE_INTENT_RE.test(trimmed) &&
    (HAS_NUMBERED_OFFICIAL_QUESTIONS_RE.test(trimmed) ||
      /Please answer each|temporary residence|digital nomad|ВНЖ|заявлен|виза в Хорват/i.test(
        trimmed,
      ))
  ) {
    return true;
  }
  // Manager pastes task notes + asks to draft answers for a named client.
  if (
    /составь|подготов|draft|prepare|answer|оформи/i.test(trimmed) &&
    /вопрос/i.test(trimmed) &&
    /UAE|Croatia Visa|резиденств|шенген|дубай|travel|визит/i.test(trimmed)
  ) {
    return true;
  }
  return false;
}

export function buildQuestionnaireAnswerPromptAddon(query: string): string {
  const hasEmbeddedQuestions =
    HAS_ENGLISH_FORM_MARKERS_RE.test(query) ||
    HAS_RUSSIAN_FORM_MARKERS_RE.test(query);
  const preferRussian = HAS_RUSSIAN_FORM_MARKERS_RE.test(query);

  return [
    "=== РЕЖИМ: ОФИЦИАЛЬНЫЕ ОТВЕТЫ НА АНКЕТУ / ЗАЯВЛЕНИЕ ===",
    "Менеджер готовит ответы для временного ВНЖ / Digital Nomad.",
    "Игнорируй формат «кратко / что важно / что дальше».",
    "",
    "ГОЛОС (самое важное):",
    "Пиши ответы ОТ ПЕРВОГО ЛИЦА заявителя — как живой человек, спокойно и естественно.",
    "Это должен звучать как речь реального клиента, а не как комментарий ассистента или канцелярия робота.",
    preferRussian
      ? "Язык ответов: русский (вопросы на русском)."
      : "Язык ответов: английский, если вопросы на английском; если вопросы на русском — отвечай по-русски.",
    "",
    "Запрещено внутри ответов на вопросы:",
    "- фразы ассистента: «based on the information currently available», «must be confirmed before submission», «не предоставлено и требует уточнения», «dates must be verified»;",
    "- мета-комментарии: «в настоящее время я не помню, въезжала ли я…» в тяжёлой канцелярской форме;",
    "- тон отчёта менеджера внутри текста заявления.",
    "",
    "Как писать факты и пробелы:",
    "- Есть факт из заметок → скажи просто и по-человечески от «я».",
    "- Клиент сам сказал «не помню» → коротко и естественно: «Я въезжала либо по немецкому шенгену, либо по безвизу — точно уже не помню.»",
    "- Данных совсем нет (работа, почему Хорватия и т.п.) → в тексте ответа одна короткая живая фраза ИЛИ строка «[уточнить у клиента]», без длинных оговорок. Детали вынеси только в блок «Что уточнить» после документа.",
    "- Не выдумывай работодателей, даты, основания, города подписи.",
    "",
    "Пример хорошего Q5:",
    "«Хорватскую визу мне в итоге не выдали. В Хорватии я раньше бывала: въезжала либо по немецкому шенгену, либо по безвизу — точно уже не помню.»",
    "",
    "Пример плохого Q5 (так НЕ писать):",
    "«В конечном итоге хорватская виза мне выдана не была. Ранее я посещала Хорватию… однако в настоящее время я не помню, въезжала ли я по шенгенской визе, выданной Германией, или на основании безвизового режима. Даты пребывания необходимо проверить…»",
    "",
    "Формат документа:",
    "1) Полный текст вопроса → сразу под ним ответ-statement от первого лица.",
    "2) Даты из заметок сохраняй; очевидные опечатки диапазонов можно мягко поправить только если смысл ясен, иначе оставь как есть и вынеси в «Что уточнить».",
    "3) В конце:",
    "Place / Место: __________________",
    "Date / Дата: __________________",
    "Signature / Подпись: __________________",
    "4) После документа — короткий блок для менеджера на русском «Что уточнить у клиента».",
    "",
    hasEmbeddedQuestions
      ? "Вопросы уже есть в сообщении — используй их дословно."
      : "Если вопросы не вставлены целиком, используй стандартный набор temporary residence / digital nomad и явно пометь это.",
  ].join("\n");
}
