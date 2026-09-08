/**
 * Deterministic AI-05 grounded-answer evaluation cases (structural expectations).
 */

export type GroundedEvalCase = {
  id: string;
  category:
    | "kb_factual"
    | "client_factual"
    | "multi"
    | "insufficient"
    | "conflicting"
    | "generation";
  query: string;
  /** Structural expectations checked without calling Claude. */
  expect: {
    needsAuthoritative?: boolean;
    allowEmptyAttribution?: boolean;
    mustNotShowBareKbWithoutContent?: boolean;
    conflictAware?: boolean;
    distinguishNotRetrievedFromMissing?: boolean;
    pureGeneration?: boolean;
  };
};

export const GROUNDED_ANSWER_EVAL_CASES: GroundedEvalCase[] = [
  {
    id: "g-kb-1",
    category: "kb_factual",
    query: "Какой минимальный доход для digital nomad?",
    expect: { needsAuthoritative: true, mustNotShowBareKbWithoutContent: true },
  },
  {
    id: "g-kb-2",
    category: "kb_factual",
    query: "What is the income threshold for the program?",
    expect: { needsAuthoritative: true },
  },
  {
    id: "g-kb-3",
    category: "kb_factual",
    query: "Какие документы нужны для ВНЖ?",
    expect: { needsAuthoritative: true },
  },
  {
    id: "g-kb-4",
    category: "kb_factual",
    query: "Срок действия разрешения?",
    expect: { needsAuthoritative: true },
  },
  {
    id: "g-kb-5",
    category: "kb_factual",
    query: "Можно ли подаваться с семьёй?",
    expect: { needsAuthoritative: true },
  },
  {
    id: "g-cli-1",
    category: "client_factual",
    query: "Какой адрес букинга у Иванова?",
    expect: { needsAuthoritative: true },
  },
  {
    id: "g-cli-2",
    category: "client_factual",
    query: "Какой статус у Марии?",
    expect: { needsAuthoritative: true },
  },
  {
    id: "g-cli-3",
    category: "client_factual",
    query: "Номер паспорта клиента Белоус?",
    expect: { needsAuthoritative: true },
  },
  {
    id: "g-cli-4",
    category: "client_factual",
    query: "Кто менеджер у Соколовой?",
    expect: { needsAuthoritative: true },
  },
  {
    id: "g-multi-1",
    category: "multi",
    query: "Каких документов не хватает Ивану Петрову для ВНЖ?",
    expect: {
      needsAuthoritative: true,
      distinguishNotRetrievedFromMissing: true,
    },
  },
  {
    id: "g-multi-2",
    category: "multi",
    query: "Сравни загруженные документы Петра с чеклистом",
    expect: {
      needsAuthoritative: true,
      distinguishNotRetrievedFromMissing: true,
    },
  },
  {
    id: "g-multi-3",
    category: "multi",
    query: "Напиши письмо и укажи отсутствующие документы по программе",
    expect: { needsAuthoritative: true },
  },
  {
    id: "g-multi-4",
    category: "multi",
    query: "What is still missing versus the residence checklist?",
    expect: {
      needsAuthoritative: true,
      distinguishNotRetrievedFromMissing: true,
    },
  },
  {
    id: "g-ins-1",
    category: "insufficient",
    query: "Какой минимальный доход? (KB empty)",
    expect: {
      needsAuthoritative: true,
      mustNotShowBareKbWithoutContent: true,
    },
  },
  {
    id: "g-ins-2",
    category: "insufficient",
    query: "Есть ли апостиль диплома в извлечённом контексте?",
    expect: {
      needsAuthoritative: true,
      distinguishNotRetrievedFromMissing: true,
    },
  },
  {
    id: "g-ins-3",
    category: "insufficient",
    query: "Что требует программа по доходу, если в выдержке дохода нет?",
    expect: { needsAuthoritative: true },
  },
  {
    id: "g-ins-4",
    category: "insufficient",
    query: "KB catalog only — invent income?",
    expect: {
      needsAuthoritative: true,
      mustNotShowBareKbWithoutContent: true,
    },
  },
  {
    id: "g-ins-5",
    category: "insufficient",
    query: "KB error path",
    expect: { needsAuthoritative: true },
  },
  {
    id: "g-conf-1",
    category: "conflicting",
    query: "Минимальный доход при двух разных KB документах",
    expect: { needsAuthoritative: true, conflictAware: true },
  },
  {
    id: "g-conf-2",
    category: "conflicting",
    query: "Which income figure is correct when sources disagree?",
    expect: { needsAuthoritative: true, conflictAware: true },
  },
  {
    id: "g-conf-3",
    category: "conflicting",
    query: "Срок разрешения: в одном файле 1 год, в другом 2 года",
    expect: { needsAuthoritative: true, conflictAware: true },
  },
  {
    id: "g-gen-1",
    category: "generation",
    query: "Переведи этот текст на английский",
    expect: { pureGeneration: true, allowEmptyAttribution: true },
  },
  {
    id: "g-gen-2",
    category: "generation",
    query: "Сделай этот абзац более профессиональным",
    expect: { pureGeneration: true, allowEmptyAttribution: true },
  },
  {
    id: "g-gen-3",
    category: "generation",
    query: "Rewrite this reminder in a warmer tone",
    expect: { pureGeneration: true, allowEmptyAttribution: true },
  },
  {
    id: "g-gen-4",
    category: "generation",
    query: "Напиши вежливое общее письмо без фактов из системы",
    expect: { pureGeneration: true, allowEmptyAttribution: true },
  },
  {
    id: "g-kb-6",
    category: "kb_factual",
    query: "Requirements for private health insurance",
    expect: { needsAuthoritative: true },
  },
  {
    id: "g-cli-5",
    category: "client_factual",
    query: "Покажи клиентов менеджера",
    expect: { needsAuthoritative: true },
  },
  {
    id: "g-multi-5",
    category: "multi",
    query: "Сопоставь пакет клиента с digital nomad чеклистом",
    expect: {
      needsAuthoritative: true,
      distinguishNotRetrievedFromMissing: true,
    },
  },
  {
    id: "g-ins-6",
    category: "insufficient",
    query: "Unknown document state for diploma",
    expect: {
      distinguishNotRetrievedFromMissing: true,
    },
  },
  {
    id: "g-conf-4",
    category: "conflicting",
    query: "Conflicting KB policy extracts",
    expect: { conflictAware: true },
  },
];

export function summarizeGroundedEvalCategories() {
  /** @type {Record<string, number>} */
  const out: Record<string, number> = {};
  for (const c of GROUNDED_ANSWER_EVAL_CASES) {
    out[c.category] = (out[c.category] ?? 0) + 1;
  }
  return out;
}
