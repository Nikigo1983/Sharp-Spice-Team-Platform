/**
 * Purpose-bound EvidencePack (Phase 1).
 * Controlled model-ingress boundary — not a whole client dump.
 */

import type { ClientRef } from "@/lib/ai/client-ref";
import type { CurrentTask, CurrentTaskClass } from "@/lib/ai/current-task";
import type { PortalFinanceSnapshot } from "@/lib/ai/portal-finance-snapshot";
import type { SafeClientRecord } from "@/lib/ai/workspace-tools/client-tools";
import {
  EMPTY_HIGH_SENSITIVITY_ALLOW,
  createHighSensitivityAllow,
  type HighSensitivityAllowSet,
} from "@/lib/ai/high-sensitivity-gate";

export type EvidenceProjectionName =
  | "CONTACT"
  | "FINANCE"
  | "CASE"
  | "DOCUMENT_META";

export type EvidenceProjectionRequest =
  | EvidenceProjectionName
  | "FULL_SAFE_PROFILE";

export type EvidenceFact = {
  key: string;
  /** Synthetic / non-PII test value ok; never log in production traces. */
  value: string;
  source: string;
  sensitivity:
    | "PUBLIC"
    | "INTERNAL"
    | "CLIENT_PERSONAL"
    | "CLIENT_FINANCIAL"
    | "CLIENT_CASE_SENSITIVE";
};

export type DocumentMetaProjection = {
  documentId: string;
  title: string;
  category?: string | null;
  uploadedAt?: string | null;
  status?: string | null;
};

export type EvidenceProjections = {
  CONTACT?: {
    displayName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  /**
   * Canonical model-visible Finance contract (major currency units + explicit code).
   * Do not add competing aliases (balance / outstanding / debt) alongside debtAmount.
   */
  FINANCE?: {
    /** Optional non-money label (e.g. counterparty name) — omit when empty. */
    contractLabel?: string | null;
    /** Contract total in major units (e.g. 2000 for €2000). */
    contractAmount?: number | null;
    /** Amount paid in major units. */
    paidAmount?: number | null;
    /** Outstanding debt in major units (authoritative debt). */
    debtAmount?: number | null;
    currency: "EUR";
    paymentStatus?: string | null;
    source: "finance";
    linkField: "clientExternalId";
  };
  CASE?: {
    status?: string | null;
    manager?: string | null;
    partner?: string | null;
    direction?: string | null;
    citizenship?: string | null;
    submittedAt?: string | null;
    approvalAt?: string | null;
    expectedApprovalAt?: string | null;
    bookingRange?: string | null;
    notesBounded?: string | null;
  };
  DOCUMENT_META?: DocumentMetaProjection[];
};

export type EvidencePack = {
  task: CurrentTaskClass;
  clientRef: ClientRef;
  projections: EvidenceProjections;
  facts: EvidenceFact[];
  sourceProvenance: string[];
  sensitivityAllow: string[];
  freshnessClass: "LIVE_FETCH" | "LOCKED_REFETCH" | "TRANSFORM_ONLY" | "UNKNOWN";
  boundedChars: number;
  retrievedAt: string;
};

export type EvidencePackTraceMeta = {
  taskClass: CurrentTaskClass;
  clientRefPresent: boolean;
  evidenceProjectionNames: EvidenceProjectionName[];
  evidenceFactCount: number;
  evidenceChars: number;
  evidenceFreshnessClass: EvidencePack["freshnessClass"];
  modelRequired: boolean;
};

const NOTES_CAP = 400;
const PACK_CHAR_CAP = 3500;

function boundNotes(notes: string | null | undefined): string | null {
  const t = notes?.trim();
  if (!t) return null;
  return t.length > NOTES_CAP ? `${t.slice(0, NOTES_CAP)}…` : t;
}

function nonEmpty(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

/** Convert integer cents to major EUR units for the model contract. */
export function majorEuroUnitsFromCents(
  cents: number | null | undefined,
): number | null {
  if (cents == null || !Number.isFinite(cents)) return null;
  return cents / 100;
}

export function formatMajorEuroForModel(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

export function projectContact(safe: SafeClientRecord): EvidenceProjections["CONTACT"] {
  const contact: NonNullable<EvidenceProjections["CONTACT"]> = {};
  const name = nonEmpty(safe.name);
  const email = nonEmpty(safe.email);
  const phone = nonEmpty(safe.phone);
  if (name) contact.displayName = name;
  if (email) contact.email = email;
  if (phone) contact.phone = phone;
  return contact;
}

export function projectFinance(
  snap: PortalFinanceSnapshot,
): NonNullable<EvidenceProjections["FINANCE"]> {
  const paidCents =
    snap.paidAmountCents ??
    (snap.contractAmountCents != null && snap.balanceCents != null
      ? snap.contractAmountCents - snap.balanceCents
      : null);
  const finance: NonNullable<EvidenceProjections["FINANCE"]> = {
    currency: "EUR",
    source: "finance",
    linkField: "clientExternalId",
  };
  const label = nonEmpty(snap.contractLabel);
  if (label) finance.contractLabel = label;
  const contractAmount = majorEuroUnitsFromCents(snap.contractAmountCents);
  const paidAmount = majorEuroUnitsFromCents(paidCents);
  const debtAmount = majorEuroUnitsFromCents(snap.balanceCents);
  if (contractAmount != null) finance.contractAmount = contractAmount;
  if (paidAmount != null) finance.paidAmount = paidAmount;
  if (debtAmount != null) finance.debtAmount = debtAmount;
  const status = nonEmpty(snap.paymentStatus);
  if (status) finance.paymentStatus = status;
  return finance;
}

export function projectCase(safe: SafeClientRecord): EvidenceProjections["CASE"] {
  const k: NonNullable<EvidenceProjections["CASE"]> = {};
  const status = nonEmpty(safe.status);
  const manager = nonEmpty(safe.manager);
  const partner = nonEmpty(safe.partner);
  const direction = nonEmpty(safe.direction);
  const citizenship = nonEmpty(safe.citizenship);
  const submittedAt = nonEmpty(safe.submittedAt);
  const approvalAt = nonEmpty(safe.approvalAt);
  const expectedApprovalAt = nonEmpty(safe.expectedApprovalAt);
  const bookingRange = nonEmpty(safe.bookingRange);
  const notesBounded = boundNotes(safe.notes);
  if (status) k.status = status;
  if (manager) k.manager = manager;
  if (partner) k.partner = partner;
  if (direction) k.direction = direction;
  if (citizenship) k.citizenship = citizenship;
  if (submittedAt) k.submittedAt = submittedAt;
  if (approvalAt) k.approvalAt = approvalAt;
  if (expectedApprovalAt) k.expectedApprovalAt = expectedApprovalAt;
  if (bookingRange) k.bookingRange = bookingRange;
  if (notesBounded) k.notesBounded = notesBounded;
  return k;
}

/**
 * Assert high-sensitivity fields are absent from projections (default policy).
 */
export function assertNoHighSensitivityInPack(pack: EvidencePack): {
  ok: boolean;
  leaks: string[];
} {
  const blob = JSON.stringify(pack.projections);
  const leaks: string[] = [];
  // Structural exclusions (keys must not appear).
  if (/"passport"/i.test(blob) || /passportNumber/i.test(blob)) {
    leaks.push("passport");
  }
  if (/dateOfBirth|date_of_birth|"dob"/i.test(blob)) leaks.push("dob");
  if (/bookingAddress|residenceAddress|homeAddress/i.test(blob)) {
    leaks.push("address");
  }
  if (/documentContent|ocrText|rawBytes/i.test(blob)) {
    leaks.push("document_content");
  }
  if (/appPassword|apiKey|password/i.test(blob)) leaks.push("secret");
  return { ok: leaks.length === 0, leaks };
}

/** Unauthorized sensitive names must be absent from model-visible EvidencePack text. */
export function assertNoUnauthorizedSensitiveNamesInModelIngress(
  text: string,
): { ok: boolean; leaks: string[] } {
  const leaks: string[] = [];
  if (/\bpassportNumber\b|\bpassport\b/i.test(text)) leaks.push("passport");
  if (/\bdateOfBirth\b|\bdate_of_birth\b|\bdob\b/i.test(text)) leaks.push("dob");
  if (
    /\bhomeAddress\b|\bresidentialAddress\b|\bresidenceAddress\b|\bbookingAddress\b/i.test(
      text,
    )
  ) {
    leaks.push("address");
  }
  return { ok: leaks.length === 0, leaks };
}

export function buildProjectionsForTask(params: {
  task: CurrentTask;
  safe: SafeClientRecord;
  finance?: PortalFinanceSnapshot | null;
  documents?: DocumentMetaProjection[] | null;
}): EvidenceProjections {
  const out: EvidenceProjections = {};
  const names = new Set(params.task.requiredProjections);

  if (names.has("CONTACT") || names.has("FULL_SAFE_PROFILE")) {
    out.CONTACT = projectContact(params.safe);
  }
  if (names.has("CASE") || names.has("FULL_SAFE_PROFILE")) {
    out.CASE = projectCase(params.safe);
  }
  if (names.has("FINANCE") || names.has("FULL_SAFE_PROFILE")) {
    if (params.finance) out.FINANCE = projectFinance(params.finance);
  }
  if (names.has("DOCUMENT_META") || names.has("FULL_SAFE_PROFILE")) {
    out.DOCUMENT_META = params.documents ?? [];
  }
  return out;
}

function factsFromProjections(
  projections: EvidenceProjections,
): EvidenceFact[] {
  const facts: EvidenceFact[] = [];
  const c = projections.CONTACT;
  if (c?.displayName) {
    facts.push({
      key: "displayName",
      value: c.displayName,
      source: "client_portal",
      sensitivity: "CLIENT_PERSONAL",
    });
  }
  if (c?.email) {
    facts.push({
      key: "email",
      value: c.email,
      source: "client_portal",
      sensitivity: "CLIENT_PERSONAL",
    });
  }
  if (c?.phone) {
    facts.push({
      key: "phone",
      value: c.phone,
      source: "client_portal",
      sensitivity: "CLIENT_PERSONAL",
    });
  }
  const f = projections.FINANCE;
  if (f) {
    if (f.contractAmount != null) {
      facts.push({
        key: "contractAmount",
        value: formatMajorEuroForModel(f.contractAmount),
        source: "finance",
        sensitivity: "CLIENT_FINANCIAL",
      });
    }
    if (f.paidAmount != null) {
      facts.push({
        key: "paidAmount",
        value: formatMajorEuroForModel(f.paidAmount),
        source: "finance",
        sensitivity: "CLIENT_FINANCIAL",
      });
    }
    if (f.debtAmount != null) {
      facts.push({
        key: "debtAmount",
        value: formatMajorEuroForModel(f.debtAmount),
        source: "finance",
        sensitivity: "CLIENT_FINANCIAL",
      });
    }
    if (f.currency) {
      facts.push({
        key: "currency",
        value: f.currency,
        source: "finance",
        sensitivity: "CLIENT_FINANCIAL",
      });
    }
    if (f.paymentStatus) {
      facts.push({
        key: "paymentStatus",
        value: f.paymentStatus,
        source: "finance",
        sensitivity: "CLIENT_FINANCIAL",
      });
    }
  }
  const k = projections.CASE;
  if (k?.status) {
    facts.push({
      key: "status",
      value: k.status,
      source: "client_portal",
      sensitivity: "CLIENT_CASE_SENSITIVE",
    });
  }
  if (k?.direction) {
    facts.push({
      key: "direction",
      value: k.direction,
      source: "client_portal",
      sensitivity: "CLIENT_CASE_SENSITIVE",
    });
  }
  return facts;
}

export function buildEvidencePack(params: {
  task: CurrentTask;
  clientRef: ClientRef;
  safe: SafeClientRecord;
  finance?: PortalFinanceSnapshot | null;
  documents?: DocumentMetaProjection[] | null;
  freshnessClass?: EvidencePack["freshnessClass"];
  highSensitivityAllow?: HighSensitivityAllowSet;
}): EvidencePack {
  const allow =
    params.highSensitivityAllow ??
    createHighSensitivityAllow(params.task.highSensitivityCaps);
  // Default Gate 1: empty allow — projections never include high-sens keys.
  void allow;
  void EMPTY_HIGH_SENSITIVITY_ALLOW;

  const projections = buildProjectionsForTask({
    task: params.task,
    safe: params.safe,
    finance: params.finance,
    documents: params.documents,
  });
  const facts = factsFromProjections(projections);
  const provenance = new Set<string>(["client_portal"]);
  if (projections.FINANCE) provenance.add("finance");
  if (projections.DOCUMENT_META?.length) provenance.add("document_meta");

  const pack: EvidencePack = {
    task: params.task.taskClass,
    clientRef: params.clientRef,
    projections,
    facts,
    sourceProvenance: [...provenance],
    sensitivityAllow: [...allow],
    freshnessClass: params.freshnessClass ?? "LIVE_FETCH",
    boundedChars: 0,
    retrievedAt: new Date().toISOString(),
  };

  let text = formatEvidencePackForModel(pack);
  if (text.length > PACK_CHAR_CAP) {
    text = `${text.slice(0, PACK_CHAR_CAP)}\n…[truncated]`;
  }
  pack.boundedChars = text.length;
  return pack;
}

/** Model-facing block — purpose-bound; unauthorized sensitive categories omitted entirely. */
export function formatEvidencePackForModel(pack: EvidencePack): string {
  const lines: string[] = [
    "=== EVIDENCE PACK (purpose-bound) ===",
    `Task: ${pack.task}`,
    `ClientRef: locked (id omitted from prompt metadata)`,
    pack.clientRef.displayLabel
      ? `Display: ${pack.clientRef.displayLabel}`
      : null,
    `Sources: ${pack.sourceProvenance.join(", ")}`,
    `Freshness: ${pack.freshnessClass}`,
    "",
  ].filter((line): line is string => line != null);

  const c = pack.projections.CONTACT;
  if (c && (c.displayName || c.email || c.phone)) {
    lines.push("CONTACT:");
    if (c.displayName) lines.push(`- name: ${c.displayName}`);
    if (c.email) lines.push(`- email: ${c.email}`);
    if (c.phone) lines.push(`- phone: ${c.phone}`);
    lines.push("");
  }

  const f = pack.projections.FINANCE;
  if (f) {
    lines.push("FINANCE (authoritative):");
    if (f.contractLabel) lines.push(`- contractLabel: ${f.contractLabel}`);
    if (f.contractAmount != null) {
      lines.push(`- contractAmount: ${formatMajorEuroForModel(f.contractAmount)}`);
    }
    if (f.paidAmount != null) {
      lines.push(`- paidAmount: ${formatMajorEuroForModel(f.paidAmount)}`);
    }
    if (f.debtAmount != null) {
      lines.push(`- debtAmount: ${formatMajorEuroForModel(f.debtAmount)}`);
    }
    lines.push(`- currency: ${f.currency}`);
    if (f.paymentStatus) lines.push(`- paymentStatus: ${f.paymentStatus}`);
    lines.push("");
  }

  const k = pack.projections.CASE;
  if (k && Object.keys(k).length > 0) {
    lines.push("CASE:");
    if (k.status) lines.push(`- status: ${k.status}`);
    if (k.manager) lines.push(`- manager: ${k.manager}`);
    if (k.partner) lines.push(`- partner: ${k.partner}`);
    if (k.direction) lines.push(`- direction: ${k.direction}`);
    if (k.citizenship) lines.push(`- citizenship: ${k.citizenship}`);
    if (k.submittedAt) lines.push(`- submittedAt: ${k.submittedAt}`);
    if (k.approvalAt) lines.push(`- approvalAt: ${k.approvalAt}`);
    if (k.expectedApprovalAt) {
      lines.push(`- expectedApprovalAt: ${k.expectedApprovalAt}`);
    }
    if (k.bookingRange) lines.push(`- bookingRange: ${k.bookingRange}`);
    if (k.notesBounded) lines.push(`- notes: ${k.notesBounded}`);
    lines.push("");
  }

  const docs = pack.projections.DOCUMENT_META;
  if (docs && docs.length > 0) {
    lines.push("DOCUMENT_META:");
    for (const doc of docs.slice(0, 20)) {
      lines.push(
        `- ${doc.title}${doc.category ? ` [${doc.category}]` : ""} (${doc.documentId})`,
      );
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function evidencePackTraceMeta(
  pack: EvidencePack | null | undefined,
  task: CurrentTask,
): EvidencePackTraceMeta {
  if (!pack) {
    return {
      taskClass: task.taskClass,
      clientRefPresent: false,
      evidenceProjectionNames: [],
      evidenceFactCount: 0,
      evidenceChars: 0,
      evidenceFreshnessClass: "UNKNOWN",
      modelRequired: task.modelRequired,
    };
  }
  const names = (Object.keys(pack.projections) as Array<
    keyof EvidenceProjections
  >).filter((key) => {
    const value = pack.projections[key];
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
  }) as EvidenceProjectionName[];
  return {
    taskClass: pack.task,
    clientRefPresent: true,
    evidenceProjectionNames: names,
    evidenceFactCount: pack.facts.length,
    evidenceChars: pack.boundedChars,
    evidenceFreshnessClass: pack.freshnessClass,
    modelRequired: task.modelRequired,
  };
}

/** Inspectable test helper — redacts values to lengths only. */
export function evidencePackSafeInspect(pack: EvidencePack): Record<string, unknown> {
  return {
    task: pack.task,
    clientRefPresent: true,
    projectionNames: Object.keys(pack.projections),
    factKeys: pack.facts.map((f) => f.key),
    factCount: pack.facts.length,
    sourceProvenance: pack.sourceProvenance,
    freshnessClass: pack.freshnessClass,
    boundedChars: pack.boundedChars,
    highSensitivityCheck: assertNoHighSensitivityInPack(pack),
  };
}

/** Phase 2.1 assembly outcome (privacy-safe metadata only). */
export type EvidencePackAssemblyOutcome =
  | "NOT_REQUIRED"
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED";

/**
 * Migrated single-client generative path invariant:
 * BROAD_CLIENT_CONTEXT_ALLOWED = false.
 * EvidencePack failure must not compensate with broader client records.
 */
export function isMigratedClientModelPath(params: {
  hasClientRef: boolean;
  modelRequired: boolean;
  requiredProjectionCount: number;
}): boolean {
  return (
    params.hasClientRef &&
    params.modelRequired &&
    params.requiredProjectionCount > 0
  );
}

/**
 * What client payload may reach Astra on a (possibly migrated) turn.
 * Never returns broad client context when migratedClientModelPath is true.
 */
export function selectClientModelIngress(params: {
  migratedClientModelPath: boolean;
  evidencePackText: string | null;
}): {
  evidencePackText: string | null;
  /** Always null on migrated paths — broad CLIENT CONTEXT forbidden. */
  allowBroadClientContext: boolean;
  broadClientFallbackToModel: boolean;
  mustFailSafe: boolean;
} {
  if (!params.migratedClientModelPath) {
    return {
      evidencePackText: params.evidencePackText,
      allowBroadClientContext: !params.evidencePackText,
      broadClientFallbackToModel: false,
      mustFailSafe: false,
    };
  }
  if (params.evidencePackText) {
    return {
      evidencePackText: params.evidencePackText,
      allowBroadClientContext: false,
      broadClientFallbackToModel: false,
      mustFailSafe: false,
    };
  }
  return {
    evidencePackText: null,
    allowBroadClientContext: false,
    broadClientFallbackToModel: false,
    mustFailSafe: true,
  };
}

/** Typed failure code when EvidencePack cannot be assembled for a migrated path. */
export function evidencePackFailureCode(kind: "null_pack" | "throw"):
  | "SOURCE_UNAVAILABLE"
  | "INTERNAL_AI_ERROR" {
  return kind === "throw" ? "INTERNAL_AI_ERROR" : "SOURCE_UNAVAILABLE";
}
