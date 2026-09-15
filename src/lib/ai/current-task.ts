/**
 * Deterministic CurrentTask classification (Phase 1).
 * Code signals + existing intent helpers — not a large LLM router.
 */

import { isClientDebtReminderLetterQuery } from "@/lib/ai/client-debt-letter";
import {
  detectRequestedClientFactField,
  type ClientFactFieldId,
} from "@/lib/ai/client-fact-lookup";
import {
  isFinanceNamedClientDebtQuery,
  isFinancePaymentDebtQuery,
} from "@/lib/ai/finance-debt-query";
import { isPassportNumberLookupQuery } from "@/lib/ai/query-intent-signals";
import { isClientListQuery } from "@/lib/ai/client-search-intent";
import { queryLooksLikeClientPii } from "@/lib/ai/client-pii-signals";

export const CURRENT_TASK_CLASSES = [
  "CONTACT_FACT",
  "FINANCE_FACT",
  "CASE_FACT",
  "CLIENT_SUMMARY",
  "PAYMENT_REMINDER",
  "FOLLOW_UP_TRANSFORM",
  "DOCUMENT_META",
  "KNOWLEDGE",
  "GENERAL_GENERATION",
  // Reserved for later phases:
  "CASE_REVIEW",
  "DOCUMENT_ANALYSIS",
] as const;

export type CurrentTaskClass = (typeof CURRENT_TASK_CLASSES)[number];

export type CurrentTask = {
  taskClass: CurrentTaskClass;
  /** Contact/case fact field when applicable. */
  factField?: ClientFactFieldId | "phone" | "passportExpiry" | null;
  modelRequired: boolean;
  /** Projections the server should assemble for EvidencePack. */
  requiredProjections: Array<
    "CONTACT" | "FINANCE" | "CASE" | "DOCUMENT_META" | "FULL_SAFE_PROFILE"
  >;
  highSensitivityCaps: Array<
    "passport_number" | "date_of_birth" | "residential_address" | "document_content"
  >;
};

const FOLLOW_UP_TRANSFORM_RE =
  /^(?:\s*)(?:сделай\s+(?:короче|теплее|мягче|жёстче|жестче|официальнее|дружелюбнее|короткий|теплый)|перепиши|переформулируй|переведи(?:\s+на\s+\w+)?|укороти|сократи|make\s+(?:it\s+)?(?:shorter|warmer|more\s+formal|friendlier)|rewrite|translate|polish)(?!\p{L})/iu;

const FULL_PROFILE_RE =
  /вся\s+информац|все\s+(?:данные|поля)|полный\s+(?:профиль|сводк)|full\s+(?:profile|info)|everything\s+about\s+(?:the\s+)?client|все\s+по\s+клиент/i;

const SUMMARY_RE =
  /резюме|сводк|summary|расскажи\s+о\s+клиент|что\s+по\s+клиент|профиль\s+клиент/i;

const DOCUMENT_META_RE =
  /какие\s+документ|список\s+документ|document\s+(?:list|meta)|файлы\s+клиент|вложения/i;

const KNOWLEDGE_RE =
  /knowledge\s+base|баз[аеы]\s+знан|из\s+базы\s+знан|kb\b/i;

const CASE_FACT_RE =
  /статус|менеджер|референт|направлен|гражданств|дата\s+подач|дата\s+одобрен|desk|дело/i;

const PHONE_FACT_RE = /телефон|phone|whats?\s*app|номер\s+тел/i;

export function isFollowUpTransformQuery(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length > 180) return false;
  return FOLLOW_UP_TRANSFORM_RE.test(trimmed);
}

export function classifyCurrentTask(params: {
  query: string;
  /** Prior assistant draft exists in recent history. */
  hasPriorDraft?: boolean;
}): CurrentTask {
  const q = params.query.trim();

  if (params.hasPriorDraft && isFollowUpTransformQuery(q)) {
    return {
      taskClass: "FOLLOW_UP_TRANSFORM",
      modelRequired: true,
      requiredProjections: [],
      highSensitivityCaps: [],
    };
  }

  if (isClientDebtReminderLetterQuery(q)) {
    return {
      taskClass: "PAYMENT_REMINDER",
      modelRequired: true,
      requiredProjections: ["CONTACT", "FINANCE", "CASE"],
      highSensitivityCaps: [],
    };
  }

  if (isFinanceNamedClientDebtQuery(q) || isFinancePaymentDebtQuery(q)) {
    return {
      taskClass: "FINANCE_FACT",
      modelRequired: false,
      requiredProjections: ["FINANCE"],
      highSensitivityCaps: [],
    };
  }

  if (isPassportNumberLookupQuery(q)) {
    return {
      taskClass: "CONTACT_FACT",
      factField: "passport",
      modelRequired: false,
      // Server-direct may return passport; EvidencePack/model must not include it.
      requiredProjections: ["CONTACT"],
      highSensitivityCaps: [],
    };
  }

  if (PHONE_FACT_RE.test(q) && queryLooksLikeClientPii(q)) {
    return {
      taskClass: "CONTACT_FACT",
      factField: "phone",
      modelRequired: false,
      requiredProjections: ["CONTACT"],
      highSensitivityCaps: [],
    };
  }

  const factField = detectRequestedClientFactField(q);
  if (factField === "email") {
    return {
      taskClass: "CONTACT_FACT",
      factField,
      modelRequired: false,
      requiredProjections: ["CONTACT"],
      highSensitivityCaps: [],
    };
  }
  if (factField === "passport") {
    return {
      taskClass: "CONTACT_FACT",
      factField: "passport",
      modelRequired: false,
      requiredProjections: ["CONTACT"],
      highSensitivityCaps: [],
    };
  }
  if (
    factField === "status" ||
    factField === "submittedAt" ||
    factField === "approvalAt" ||
    factField === "partner" ||
    factField === "latinName" ||
    factField === "notes"
  ) {
    return {
      taskClass: "CASE_FACT",
      factField,
      modelRequired: false,
      requiredProjections: ["CASE"],
      highSensitivityCaps: [],
    };
  }
  if (factField === "bookingAddress") {
    return {
      taskClass: "CASE_FACT",
      factField,
      modelRequired: false,
      // Direct path may answer; model EvidencePack still gated.
      requiredProjections: ["CASE"],
      highSensitivityCaps: [],
    };
  }
  if (factField === "bookingRange") {
    return {
      taskClass: "CASE_FACT",
      factField,
      modelRequired: false,
      requiredProjections: ["CASE"],
      highSensitivityCaps: [],
    };
  }

  if (FULL_PROFILE_RE.test(q)) {
    return {
      taskClass: "CLIENT_SUMMARY",
      modelRequired: true,
      requiredProjections: ["FULL_SAFE_PROFILE"],
      highSensitivityCaps: [],
    };
  }

  if (DOCUMENT_META_RE.test(q)) {
    return {
      taskClass: "DOCUMENT_META",
      modelRequired: false,
      requiredProjections: ["DOCUMENT_META"],
      highSensitivityCaps: [],
    };
  }

  if (KNOWLEDGE_RE.test(q)) {
    return {
      taskClass: "KNOWLEDGE",
      modelRequired: true,
      requiredProjections: [],
      highSensitivityCaps: [],
    };
  }

  if (SUMMARY_RE.test(q) || (queryLooksLikeClientPii(q) && /расскажи|сводк|резюме/i.test(q))) {
    return {
      taskClass: "CLIENT_SUMMARY",
      modelRequired: true,
      requiredProjections: ["CONTACT", "CASE", "FINANCE"],
      highSensitivityCaps: [],
    };
  }

  if (isClientListQuery(q)) {
    return {
      taskClass: "GENERAL_GENERATION",
      modelRequired: false,
      requiredProjections: [],
      highSensitivityCaps: [],
    };
  }

  if (CASE_FACT_RE.test(q) && queryLooksLikeClientPii(q)) {
    return {
      taskClass: "CASE_FACT",
      modelRequired: false,
      requiredProjections: ["CASE"],
      highSensitivityCaps: [],
    };
  }

  if (queryLooksLikeClientPii(q)) {
    return {
      taskClass: "CLIENT_SUMMARY",
      modelRequired: true,
      requiredProjections: ["CONTACT", "CASE"],
      highSensitivityCaps: [],
    };
  }

  return {
    taskClass: "GENERAL_GENERATION",
    modelRequired: true,
    requiredProjections: [],
    highSensitivityCaps: [],
  };
}

/** True when the task needs a locked or newly resolved ClientRef. */
export function taskRequiresClientRef(task: CurrentTask): boolean {
  if (task.taskClass === "FOLLOW_UP_TRANSFORM") return false;
  if (task.taskClass === "KNOWLEDGE") return false;
  if (task.taskClass === "GENERAL_GENERATION") return false;
  return true;
}
