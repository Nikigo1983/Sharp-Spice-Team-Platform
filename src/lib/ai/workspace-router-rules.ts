/**
 * Layered workspace routing — deterministic rules (AI-03).
 * Semantic generalization via pattern families, not per-eval-question lists.
 */

import {
  isEmigrantDrivePrimaryQuery,
  isPassportNumberLookupQuery,
} from "@/lib/ai/query-intent-signals";
import type { WorkspaceQueryIntent } from "@/lib/ai/query-intent";
import { isClientListQuery } from "@/lib/ai/client-search-intent";
import type {
  WorkspaceRouteIntentLabel,
  WorkspaceRouteSource,
  WorkspaceRouterDecision,
} from "@/lib/ai/workspace-router-types";

const NON_PERSON_TOKENS = new Set([
  "хорватии",
  "хорватия",
  "хорватию",
  "croatia",
  "испании",
  "испания",
  "spain",
  "португалии",
  "portugal",
  "внж",
  "digital",
  "nomad",
  "напоминанием",
  "напоминание",
  "вежливое",
  "письмо",
  "документы",
  "документ",
  "требования",
  "программа",
  "residence",
  "croatian",
  "required",
  "documents",
  "нужны",
  "нужно",
  "для",
  "какие",
  "какой",
  "какая",
  "что",
  "этот",
  "текст",
  "общее",
]);

/** JS `\b` is ASCII-only; use Unicode letter boundaries for Cyrillic. */
function hasWord(query: string, pattern: string): boolean {
  return new RegExp(`(?<!\\p{L})(?:${pattern})(?!\\p{L})`, "iu").test(query);
}

/**
 * True only when the query likely names a real person/client — not countries,
 * program nouns, or generic search tokens from extractPersonNameTokens.
 */
function isPlausiblePersonToken(token: string): boolean {
  const lower = token.toLowerCase();
  if (NON_PERSON_TOKENS.has(lower)) return false;
  if (/^(него|неё|нее|них|нас|вас|этого|этой|клиент)/u.test(lower)) {
    return false;
  }
  return true;
}

function hasClientNameSignal(query: string): boolean {
  // «Иван Петров» / «Belous Ekaterina»
  const fullName = query.match(
    /(?<!\p{L})([А-ЯЁA-Z][а-яёa-z\-']{2,})\s+([А-ЯЁA-Z][а-яёa-z\-']{2,})(?!\p{L})/u,
  );
  if (fullName) {
    const a = fullName[1].toLowerCase();
    const b = fullName[2].toLowerCase();
    if (!NON_PERSON_TOKENS.has(a) && !NON_PERSON_TOKENS.has(b)) {
      return true;
    }
  }

  // Prefer «клиент Антоновой» / «у клиента Антоновой» BEFORE bare «у …».
  // Otherwise «У клиента X» matches as «у»+«клиента» and drops the real surname.
  const afterClientWord = query.match(
    /клиент[а-яё]*\s+([А-ЯЁA-Za-zа-яё\-']{3,})/iu,
  );
  if (afterClientWord?.[1] && isPlausiblePersonToken(afterClientWord[1])) {
    return true;
  }

  // «у Марии…» (not «у клиента» — handled above)
  const afterU = query.match(
    /(?<!\p{L})у\s+([А-ЯЁA-Za-zа-яё\-']{3,})/iu,
  );
  if (afterU?.[1] && isPlausiblePersonToken(afterU[1])) {
    return true;
  }

  // «Адрес букинга Антоновой» / «Антоновой адрес букинга»
  const afterField = query.match(
    /(?:адрес\s+букинга|booking\s+address|дат[аы]\s+букинга|паспорт|email|почта|статус)\s+([А-ЯЁA-Z][а-яёa-z\-']{3,})/u,
  );
  if (afterField?.[1] && isPlausiblePersonToken(afterField[1])) {
    return true;
  }
  const beforeField = query.match(
    /([А-ЯЁA-Z][а-яёa-z\-']{3,})\s+(?:адрес\s+букинга|booking\s+address|букинг)/u,
  );
  if (beforeField?.[1] && isPlausiblePersonToken(beforeField[1])) {
    return true;
  }

  // Common first-name stems with case endings (RU) / Latin forms (EN).
  if (
    hasWord(
      query,
      "иван(?:а|у|ом|е|ы)?|петр(?:а|у|ом|е)?|пётр(?:а|у|ом|е)?|мари(?:я|и|ю|ей)|анн(?:а|е|у|ой)|белоус(?:а|у|ой)?|белов(?:а|ой|у)?|калашников(?:а|у|ой)?|ivan(?:a|u|om)?|petr(?:a|u|ov|ova)?|maria|marie|anna|anne|belova|belov|petrov|smirnov(?:a)?",
    )
  ) {
    return true;
  }

  return false;
}

/** Compact EN/RU signals for structured client fields (not program knowledge). */
function hasClientFieldSignal(query: string): boolean {
  const lower = query.toLowerCase();
  return (
    /букинг|адрес|статус|паспорт|телефон|email|почт|менеджер/i.test(lower) ||
    /\bbooking\b|\baddress\b|\bstatus\b|\bpassport\b|\bphone\b|\bemail\b|\bmanager\b|\breferent\b/i.test(
      lower,
    ) ||
    /client\s+details|case\s+information|contact\s+info/i.test(lower)
  );
}

/** Program / checklist / eligibility signals (corporate KB). */
function hasProgramRequirementSignal(query: string): boolean {
  const lower = query.toLowerCase();
  return (
    /требован|чеклист|checklist|программ|eligibility|digital\s*nomad|residence|сравни|сопоставь|compare|requirements?|against\s+the/i.test(
      lower,
    ) ||
    /для\s+внж|(?<!\p{L})внж(?!\p{L})/iu.test(query) ||
    /пакет.{0,40}(с|и)\s+(требован|чеклист|программ|digital|внж)/i.test(lower)
  );
}

/**
 * Named client + compare/uploads/checklist against program rules → multi-source.
 */
export function isClientProgramCompareQuery(query: string): boolean {
  if (!hasClientNameSignal(query)) return false;
  if (!hasProgramRequirementSignal(query)) return false;
  const lower = query.toLowerCase();
  // Must involve the client's docs/situation, not pure program FAQ.
  return (
    /загруж|upload|drive|папк|пакет|документ|файл|сравни|сопоставь|compare|against|чеклист|checklist|не\s+хвата|отсутств|известн|present|missing|неизвестн/i.test(
      lower,
    ) || /что\s+(уже\s+)?(загруж|есть)|known\s+present/i.test(lower)
  );
}

function isPureGenerationQuery(query: string): boolean {
  const lower = query.toLowerCase();
  const trimmed = query.trim();
  const generationVerbs =
    /^(напиши|перепиши|переформулируй|переведи|сделай\s+текст|улучши\s+текст|make\s+this|rewrite|translate|polish)(?!\p{L})/iu.test(
      trimmed,
    ) ||
    hasWord(lower, "переведи|rewrite|translate") ||
    /более\s+профессиональн/iu.test(lower);

  if (!generationVerbs) return false;

  // Generation that needs real client facts is not "pure".
  if (
    hasWord(lower, "отсутств\\w*|статус|паспорт|букинг|долг|оплат\\w*") ||
    /не\s+хвата/iu.test(lower) ||
    /недостающ/iu.test(lower)
  ) {
    return false;
  }
  // Named person (not the word «клиенту» alone).
  if (hasClientNameSignal(query)) return false;
  return true;
}

/** General program / immigration knowledge (corporate KB), not a client's files. */
export function isGeneralKnowledgeQuery(query: string): boolean {
  const lower = query.toLowerCase();

  if (isClientSpecificDocumentQuery(query)) return false;
  if (isClientProgramCompareQuery(query)) return false;
  if (isEmigrantDrivePrimaryQuery(query)) return false;
  // Named client + structured field → not KB FAQ (e.g. "What is Maria Belova booking address?")
  if (hasClientNameSignal(query) && hasClientFieldSignal(query)) return false;

  const kbSignals = [
    /база\s*знан/i,
    /\bknowledge\b/i,
    /digital\s*nomad/i,
    /иммиграц/i,
    /\bimmigration\b/i,
    /требован/i,
    /услов(ия|ий|иях)/i,
    /программ/i,
    /основан(ия|ие|ий)/i,
    /заявител/i,
    /что\s+такое/i,
    /what\s+is\b/i,
    /какие\s+документ[аы]?\s+(нужн|требу)/i,
    /что\s+нужн[оа]?\s+(для|чтобы)/i,
    /документ[аы]?\s+нужны\s+для/i,
    /для\s+получен(ия|ие)\s+внж/i,
    /для\s+внж/i,
    /для\s+виз/i,
    /\bвнж\b/i,
    /чеклист|checklist|бумаг/i,
    /nomad[- ]?виз/i,
    /срок[а]?\s+(выда|разреш|действия)/i,
    /можно\s+ли\s+пода/i,
    /с\s+семь/i,
    /доход.*(заявител|nomad|нужн)/i,
    /сколько\s+должен\s+зарабатыв/i,
    /расскажи\s+(услов|требован|программ|про\s+)/i,
    /explain\s+(the\s+)?(program|requirements|digital)/i,
    /requirements?\s+(for|to)\b/i,
    /documents?\s+required\s+for\b/i,
    /required\s+for\s+.*residence/i,
    /croatian\s+residence/i,
    /income\s+(figure|threshold|requirement)|minimal(?:um)?\s+income|stated\s+in\s+the\s+notes/i,
  ];

  if (!kbSignals.some((pattern) => pattern.test(query) || pattern.test(lower))) {
    return false;
  }

  // Desk/status phrasing about approval should not become KB-only via bare "ВНЖ".
  if (/внж\s+одобрен|статус\s+дела|в\s+кабинет/i.test(lower)) {
    return false;
  }

  return true;
}

/** Named client + their uploaded/missing case documents. */
export function isClientSpecificDocumentQuery(query: string): boolean {
  if (!hasClientNameSignal(query)) return false;
  const lower = query.toLowerCase();
  return (
    /загру(зил|зила|зили|жен|жены|женные|зить|женн)/i.test(lower) ||
    /\bupload(?:ed|s)?\b/i.test(lower) ||
    /не\s+хвата/i.test(lower) ||
    /недостающ/i.test(lower) ||
    /отсутств/i.test(lower) ||
    /какие\s+документ/i.test(lower) ||
    /скан/i.test(lower) ||
    /pdf/i.test(lower) ||
    /файл/i.test(lower) ||
    /копи/i.test(lower) ||
    /drive/i.test(lower) ||
    /папк/i.test(lower) ||
    /сравни|сопоставь|compare|against/i.test(lower) ||
    /пакет/i.test(lower) ||
    /чеклист|checklist/i.test(lower)
  );
}

function isFormgridQuery(query: string): boolean {
  const lower = query.toLowerCase();
  return (
    lower.includes("formgrid") ||
    lower.includes("анкет") ||
    lower.includes("заявк") ||
    lower.includes("лид") ||
    /новые\s+клиент/i.test(lower)
  );
}

function isDeskStatusQuery(query: string): boolean {
  const lower = query.toLowerCase();
  if (isEmigrantDrivePrimaryQuery(query)) return false;
  return (
    lower.includes("кабинет") ||
    lower.includes("статус дела") ||
    lower.includes("статус клиента") ||
    lower.includes("текущий статус") ||
    lower.includes("внж одобрен") ||
    lower.includes("виза d") ||
    lower.includes("дело №") ||
    lower.includes("дело no") ||
    /статус\s+в\s+emigrant/i.test(lower) ||
    (lower.includes("emigrant") && lower.includes("статус")) ||
    (lower.includes("статус") && lower.includes("клиент") && hasClientNameSignal(query))
  );
}

function isClientLookupQuery(query: string): boolean {
  const lower = query.toLowerCase();
  if (isGeneralKnowledgeQuery(query) && !hasClientNameSignal(query)) {
    return false;
  }
  if (isClientListQuery(query)) return true;
  if (isPassportNumberLookupQuery(query)) return true;

  const hasName = hasClientNameSignal(query);
  const fastLookup = hasName && hasClientFieldSignal(query);

  if (fastLookup) return true;
  if (hasName && /(?:покажи|найди|кто\s+так|данные|карточк)|(?<!\p{L})(?:show|find)(?!\p{L})/iu.test(query)) {
    return true;
  }
  if (/клиент[а-я]*\s+(менеджер|референт|по\s+)/i.test(lower)) return true;
  if (/clients?\s+by\b|\bshow\s+clients\b|by\s+referent\b/i.test(lower)) return true;
  if (/у\s+кого|список\s+клиент|покажи\s+(всех\s+)?клиент/i.test(lower)) {
    return true;
  }
  return false;
}

function buildIntentFromSources(params: {
  sources: WorkspaceRouteSource[];
  query: string;
  label: WorkspaceRouteIntentLabel;
}): WorkspaceQueryIntent {
  const { sources, query, label } = params;
  const lower = query.toLowerCase();
  const emigrantDrivePrimary = isEmigrantDrivePrimaryQuery(query);
  const asksPassportFromTable = isPassportNumberLookupQuery(query);
  const hasClientName = hasClientNameSignal(query);
  const documentOriented =
    isClientSpecificDocumentQuery(query) ||
    isClientProgramCompareQuery(query) ||
    isEmigrantDrivePrimaryQuery(query) ||
    /скан|pdf|файл|upload|drive|папк/i.test(lower);

  const needsKb = sources.includes("knowledge_base");
  const needsClients = sources.includes("clients");
  const needsEmigrantDrive = sources.includes("emigrant_drive");
  const needsEmigrantDesk = sources.includes("emigrant_desk");
  const needsFormgrid = sources.includes("formgrid");

  const fastClientLookup =
    hasClientName &&
    !documentOriented &&
    (hasClientFieldSignal(query) || asksPassportFromTable);

  const needsKbFullText =
    needsKb &&
    !fastClientLookup &&
    (lower.includes("сравн") ||
      lower.includes("требован") ||
      lower.includes("программ") ||
      lower.includes("чек") ||
      lower.includes("услов") ||
      lower.includes("документ") ||
      lower.includes("внж") ||
      lower.includes("nomad") ||
      lower.includes("requirement") ||
      lower.includes("заявител") ||
      lower.includes("доход"));

  const needsEmigrantDriveFullText =
    needsEmigrantDrive &&
    !fastClientLookup &&
    (emigrantDrivePrimary ||
      lower.includes("содерж") ||
      lower.includes("текст") ||
      lower.includes("загруз") ||
      lower.includes("не хвата") ||
      lower.includes("отсутств") ||
      lower.includes("прочит") ||
      lower.includes("открой") ||
      lower.includes("покажи документ") ||
      lower.includes("найди") ||
      lower.includes("информац"));

  return {
    fastClientLookup,
    needsKb: needsKb && !fastClientLookup,
    needsKbFullText,
    needsEmigrantDrive: needsEmigrantDrive && !fastClientLookup,
    needsEmigrantDriveFullText,
    emigrantDrivePrimary,
    needsClients: !emigrantDrivePrimary && needsClients,
    needsEmigrantDesk: !emigrantDrivePrimary && needsEmigrantDesk,
    needsFormgrid,
  };
}

export type RuleRouteResult = {
  decision: Omit<
    WorkspaceRouterDecision,
    "routerModelRequested" | "fallbackUsed" | "fallbackReason" | "method"
  > & { method: "DIRECT" | "RULE" };
  /** When true, sync rules are enough — skip AI classifier. */
  highConfidence: boolean;
};

/**
 * Deterministic routing. Prefer highConfidence=true only when route is unambiguous.
 */
export function routeWorkspaceQueryByRules(query: string): RuleRouteResult {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();

  if (!trimmed) {
    return {
      highConfidence: true,
      decision: {
        intentLabel: "unknown",
        sources: [],
        requiresAuthoritativeData: false,
        confidence: 1,
        reason: "empty_query",
        method: "DIRECT",
        workspaceIntent: {
          fastClientLookup: false,
          needsKb: false,
          needsKbFullText: false,
          needsEmigrantDrive: false,
          needsEmigrantDriveFullText: false,
          emigrantDrivePrimary: false,
          needsClients: false,
          needsEmigrantDesk: false,
          needsFormgrid: false,
        },
      },
    };
  }

  if (isPureGenerationQuery(trimmed)) {
    return {
      highConfidence: true,
      decision: {
        intentLabel: "generation",
        sources: [],
        requiresAuthoritativeData: false,
        confidence: 0.92,
        reason: "pure_generation",
        method: "RULE",
        workspaceIntent: buildIntentFromSources({
          sources: [],
          query: trimmed,
          label: "generation",
        }),
      },
    };
  }

  if (isEmigrantDrivePrimaryQuery(trimmed)) {
    const sources: WorkspaceRouteSource[] = ["emigrant_drive"];
    return {
      highConfidence: true,
      decision: {
        intentLabel: "client_documents",
        sources,
        requiresAuthoritativeData: true,
        confidence: 0.95,
        reason: "emigrant_drive_primary",
        method: "RULE",
        workspaceIntent: buildIntentFromSources({
          sources,
          query: trimmed,
          label: "client_documents",
        }),
      },
    };
  }

  if (isPassportNumberLookupQuery(trimmed)) {
    const sources: WorkspaceRouteSource[] = ["clients"];
    return {
      highConfidence: true,
      decision: {
        intentLabel: "client_lookup",
        sources,
        requiresAuthoritativeData: true,
        confidence: 0.95,
        reason: "passport_table_lookup",
        method: "DIRECT",
        workspaceIntent: buildIntentFromSources({
          sources,
          query: trimmed,
          label: "client_lookup",
        }),
      },
    };
  }

  // Named client + program checklist / compare / eligibility → multi-source
  if (isClientProgramCompareQuery(trimmed) || isClientSpecificDocumentQuery(trimmed)) {
    const sources: WorkspaceRouteSource[] = ["clients", "emigrant_drive"];
    if (isClientProgramCompareQuery(trimmed) || hasProgramRequirementSignal(trimmed)) {
      sources.push("knowledge_base");
    }
    const label: WorkspaceRouteIntentLabel =
      sources.includes("knowledge_base") ? "multi" : "client_documents";
    return {
      highConfidence: true,
      decision: {
        intentLabel: label,
        sources,
        requiresAuthoritativeData: true,
        confidence: 0.88,
        reason: sources.includes("knowledge_base")
          ? "client_program_compare"
          : "client_specific_documents",
        method: "RULE",
        workspaceIntent: buildIntentFromSources({
          sources,
          query: trimmed,
          label,
        }),
      },
    };
  }

  if (isClientLookupQuery(trimmed)) {
    const sources: WorkspaceRouteSource[] = ["clients"];
    if (isDeskStatusQuery(trimmed)) sources.push("emigrant_desk");
    if (isFormgridQuery(trimmed)) sources.push("formgrid");
    return {
      highConfidence: true,
      decision: {
        intentLabel: isClientListQuery(trimmed) ? "client_list" : "client_lookup",
        sources,
        requiresAuthoritativeData: true,
        confidence: 0.9,
        reason: "client_structured_lookup",
        method: "RULE",
        workspaceIntent: buildIntentFromSources({
          sources,
          query: trimmed,
          label: isClientListQuery(trimmed) ? "client_list" : "client_lookup",
        }),
      },
    };
  }

  if (isDeskStatusQuery(trimmed)) {
    const sources: WorkspaceRouteSource[] = ["emigrant_desk"];
    if (hasClientNameSignal(trimmed)) sources.push("clients");
    return {
      highConfidence: true,
      decision: {
        intentLabel: "desk_status",
        sources,
        requiresAuthoritativeData: true,
        confidence: 0.9,
        reason: "emigrant_desk_status",
        method: "RULE",
        workspaceIntent: buildIntentFromSources({
          sources,
          query: trimmed,
          label: "desk_status",
        }),
      },
    };
  }

  if (isFormgridQuery(trimmed) && !isGeneralKnowledgeQuery(trimmed)) {
    const sources: WorkspaceRouteSource[] = ["formgrid"];
    return {
      highConfidence: true,
      decision: {
        intentLabel: "formgrid",
        sources,
        requiresAuthoritativeData: true,
        confidence: 0.9,
        reason: "formgrid_leads",
        method: "RULE",
        workspaceIntent: buildIntentFromSources({
          sources,
          query: trimmed,
          label: "formgrid",
        }),
      },
    };
  }

  if (isGeneralKnowledgeQuery(trimmed)) {
    const sources: WorkspaceRouteSource[] = ["knowledge_base"];
    return {
      highConfidence: true,
      decision: {
        intentLabel: "knowledge",
        sources,
        requiresAuthoritativeData: true,
        confidence: 0.9,
        reason: "general_knowledge_question",
        method: "RULE",
        workspaceIntent: buildIntentFromSources({
          sources,
          query: trimmed,
          label: "knowledge",
        }),
      },
    };
  }

  // Writing to a named client with missing-doc / status facts
  if (
    hasClientNameSignal(trimmed) &&
    /напиши|письмо|сообщен/i.test(lower) &&
    /отсутств|не\s+хвата|недостающ|документ|статус/i.test(lower)
  ) {
    const sources: WorkspaceRouteSource[] = ["clients", "emigrant_drive"];
    return {
      highConfidence: true,
      decision: {
        intentLabel: "multi",
        sources,
        requiresAuthoritativeData: true,
        confidence: 0.85,
        reason: "client_factual_generation",
        method: "RULE",
        workspaceIntent: buildIntentFromSources({
          sources,
          query: trimmed,
          label: "multi",
        }),
      },
    };
  }

  // Soft authoritative cue: single safe source, never load-all
  const soft = softAuthoritativeFallbackSources(trimmed);
  if (soft.length > 0) {
    const label: WorkspaceRouteIntentLabel =
      soft[0] === "knowledge_base" ? "knowledge" : soft[0] === "clients" ? "client_lookup" : "unknown";
    return {
      highConfidence: true,
      decision: {
        intentLabel: label,
        sources: soft,
        requiresAuthoritativeData: true,
        confidence: 0.78,
        reason: "soft_authoritative_fallback",
        method: "RULE",
        workspaceIntent: buildIntentFromSources({
          sources: soft,
          query: trimmed,
          label,
        }),
      },
    };
  }

  // Ambiguous — soft defaults for AI stage (do NOT load everything)
  return {
    highConfidence: false,
    decision: {
      intentLabel: "unknown",
      sources: [],
      requiresAuthoritativeData: false,
      confidence: 0.35,
      reason: "ambiguous_needs_classifier",
      method: "RULE",
      workspaceIntent: buildIntentFromSources({
        sources: [],
        query: trimmed,
        label: "unknown",
      }),
    },
  };
}

/**
 * When rules/AI are ambiguous but a single authoritative source is clear,
 * preserve that source. Never expands to load-all.
 */
export function softAuthoritativeFallbackSources(query: string): WorkspaceRouteSource[] {
  const lower = query.toLowerCase();
  if (hasClientNameSignal(query) && hasClientFieldSignal(query)) {
    return ["clients"];
  }
  // EN/RU income / notes / threshold questions without a named client → KB
  if (
    !hasClientNameSignal(query) &&
    (/income|доход|figure|threshold|notes|listed|stated|minimal(?:um)?/i.test(lower) ||
      /what\s+is\s+(the\s+)?(exact\s+)?income/i.test(lower))
  ) {
    return ["knowledge_base"];
  }
  return [];
}

/** Map validated AI classification → workspace intent flags. */
export function workspaceIntentFromAiClassification(
  query: string,
  classification: {
    intent: WorkspaceRouteIntentLabel;
    sources: WorkspaceRouteSource[];
    requires_authoritative_data: boolean;
  },
): WorkspaceQueryIntent {
  return buildIntentFromSources({
    sources: classification.sources,
    query,
    label: classification.intent,
  });
}
