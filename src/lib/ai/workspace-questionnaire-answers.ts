/**
 * Official questionnaire / temporary-residence Q&A drafting for AI Workspace.
 * Produces English statement answers that keep each question text,
 * grounded only in pasted notes / CLIENT CONTEXT / case memory.
 */

export const WORKSPACE_QUESTIONNAIRE_MAX_TOKENS = 4000;

const QUESTIONNAIRE_INTENT_RE =
  /ответь\s+на\s+вопрос|ответы\s+на\s+вопрос|составь\s+ответ|составить\s+ответ|заполни\s+ответ|please\s+answer\s+each|retain\s+the\s+text\s+of\s+the\s+question|temporary\s+residence\s+permit|digital\s+nomad\s+status|place\s+and\s+date\s+of\s+signing|город[, ]\s*дат|подпись\s+поставить|вопросы\s+нов|для\s+мазурин|questionnaire\s+answers?/i;

const HAS_NUMBERED_OFFICIAL_QUESTIONS_RE =
  /(?:^|\n)\s*1\.\s*.{10,}(?:chose|residence|employment|Croatia)/im;

const HAS_ENGLISH_FORM_MARKERS_RE =
  /Please explain why you chose|Have you previously held a temporary residence|Which countries have you visited|Please indicate the place and date of signing/i;

export function isQuestionnaireAnswerIntent(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 40) return false;
  if (HAS_ENGLISH_FORM_MARKERS_RE.test(trimmed)) return true;
  if (
    QUESTIONNAIRE_INTENT_RE.test(trimmed) &&
    (HAS_NUMBERED_OFFICIAL_QUESTIONS_RE.test(trimmed) ||
      /Please answer each|temporary residence|digital nomad|ВНЖ|заявлен/i.test(
        trimmed,
      ))
  ) {
    return true;
  }
  // Manager pastes task notes + asks to draft answers for a named client.
  if (
    /составь|подготов|draft|prepare|answer/i.test(trimmed) &&
    /вопрос/i.test(trimmed) &&
    /UAE|Croatia Visa|резиденств|шенген|дубай|travel|визит/i.test(trimmed)
  ) {
    return true;
  }
  return false;
}

export function buildQuestionnaireAnswerPromptAddon(query: string): string {
  const hasEmbeddedQuestions = HAS_ENGLISH_FORM_MARKERS_RE.test(query);
  return [
    "=== РЕЖИМ: ОФИЦИАЛЬНЫЕ ОТВЕТЫ НА АНКЕТУ / ЗАЯВЛЕНИЕ ===",
    "Менеджер готовит ответы для временного ВНЖ / Digital Nomad (или похожей анкеты).",
    "Игнорируй обычный формат «кратко / что важно / что дальше» и лимит краткости.",
    "",
    "Обязательный формат готового документа:",
    "1) Для каждого вопроса: сначала ПОЛНЫЙ текст вопроса на английском (как дан), сразу под ним ответ в форме statement на английском.",
    "2) Не выдумывай факты. Используй только: текст запроса менеджера / заметки задачи, CLIENT CONTEXT, ПАМЯТЬ КЕЙСА, СВОДКУ ДИАЛОГА.",
    "3) Если данных нет — напиши честный statement вроде: \"Based on the information currently available, this has not been provided and must be confirmed with the applicant.\"",
    "4) Даты из заметок сохраняй как есть (можно нормализовать очевидные опечатки диапазонов, но не меняй смысл). При сомнении отметь uncertainty.",
    "5) В конце документа обязательно блок:",
    "Place: …",
    "Date: …",
    "Signature: __________________",
    "Если город/дата подписи неизвестны — оставь Place/Date как заполняемые поля, не выдумывай.",
    "6) После готового документа добавь короткий блок для менеджера на русском: «Что уточнить у клиента» — только реально недостающие пункты.",
    "",
    hasEmbeddedQuestions
      ? "Вопросы уже есть в сообщении менеджера — используй их дословно."
      : "Если вопросы не вставлены целиком, используй стандартный набор temporary residence / digital nomad questions на английском и явно пометь это.",
    "",
    "Типичное покрытие по заметкам вида Mazurina:",
    "- Q3: prior residency (например UAE from 25.01.2023) — если срок/основание/текущий статус не даны, так и скажи.",
    "- Q5: Croatia visa not ultimately issued; entry may have been on German Schengen or visa-free — applicant unsure.",
    "- Q6: travel list from notes as statements with periods; purpose = travel/visit unless stated otherwise; visa type only if stated.",
    "- Q1/Q2/Q4: обычно отсутствуют в таких заметках — не выдумывай.",
  ].join("\n");
}
