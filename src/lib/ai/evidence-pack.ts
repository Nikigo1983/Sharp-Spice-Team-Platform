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
  FINANCE?: {
    contractLabel?: string | null;
    contractAmount?: string | null;
    paidAmount?: string | null;
    balance?: string | null;
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

export function projectContact(safe: SafeClientRecord): EvidenceProjections["CONTACT"] {
  return {
    displayName: safe.name,
    email: safe.email,
    phone: safe.phone,
  };
}

export function projectFinance(
  snap: PortalFinanceSnapshot,
): NonNullable<EvidenceProjections["FINANCE"]> {
  return {
    contractLabel: snap.contractLabel,
    contractAmount: snap.contractAmount,
    paidAmount: snap.paidAmount,
    balance: snap.balance,
    paymentStatus: snap.paymentStatus,
    source: "finance",
    linkField: "clientExternalId",
  };
}

export function projectCase(safe: SafeClientRecord): EvidenceProjections["CASE"] {
  return {
    status: safe.status,
    manager: safe.manager,
    partner: safe.partner,
    direction: safe.direction,
    citizenship: safe.citizenship,
    submittedAt: safe.submittedAt,
    approvalAt: safe.approvalAt,
    expectedApprovalAt: safe.expectedApprovalAt,
    bookingRange: safe.bookingRange,
    notesBounded: boundNotes(safe.notes),
  };
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
    if (f.contractAmount) {
      facts.push({
        key: "contractAmount",
        value: f.contractAmount,
        source: "finance",
        sensitivity: "CLIENT_FINANCIAL",
      });
    }
    if (f.paidAmount) {
      facts.push({
        key: "paidAmount",
        value: f.paidAmount,
        source: "finance",
        sensitivity: "CLIENT_FINANCIAL",
      });
    }
    if (f.balance) {
      facts.push({
        key: "balance",
        value: f.balance,
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

/** Model-facing block — purpose-bound, no secrets / passport / DOB / address. */
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
  if (c) {
    lines.push("CONTACT:");
    if (c.displayName) lines.push(`- name: ${c.displayName}`);
    if (c.email) lines.push(`- email: ${c.email}`);
    if (c.phone) lines.push(`- phone: ${c.phone}`);
    lines.push("");
  }

  const f = pack.projections.FINANCE;
  if (f) {
    lines.push("FINANCE (authoritative via clientExternalId):");
    if (f.contractLabel) lines.push(`- contract: ${f.contractLabel}`);
    if (f.contractAmount) lines.push(`- contractAmount: ${f.contractAmount}`);
    if (f.paidAmount) lines.push(`- paidAmount: ${f.paidAmount}`);
    if (f.balance) lines.push(`- balance/debt: ${f.balance}`);
    if (f.paymentStatus) lines.push(`- paymentStatus: ${f.paymentStatus}`);
    lines.push("");
  }

  const k = pack.projections.CASE;
  if (k) {
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

  lines.push(
    "High-sensitivity (passport / DOB / home address / document content) excluded by default.",
  );
  return lines.join("\n");
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
