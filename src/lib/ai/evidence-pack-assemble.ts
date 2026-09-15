/**
 * Assemble EvidencePack from authorized portal + Finance loaders (Phase 1).
 */

import type { ClientRef } from "@/lib/ai/client-ref";
import type { CurrentTask } from "@/lib/ai/current-task";
import {
  buildEvidencePack,
  type DocumentMetaProjection,
  type EvidencePack,
} from "@/lib/ai/evidence-pack";
import {
  getPortalFinanceSnapshot,
  type PortalFinanceSnapshot,
} from "@/lib/ai/portal-finance-snapshot";
import {
  getPortalIntakeCaseById,
  portalCaseToContext,
} from "@/lib/ai/portal-intake-clients";
import {
  projectSafeFromResolved,
  type SafeClientRecord,
} from "@/lib/ai/workspace-tools/client-tools";
import { readStaffDocuments } from "@/lib/client-portal/staff-case-meta";
import { createHighSensitivityAllow } from "@/lib/ai/high-sensitivity-gate";

export type EvidenceAssembleLoaders = {
  getSafeClient: (clientId: string) => Promise<SafeClientRecord | null>;
  getFinance: (clientId: string) => Promise<PortalFinanceSnapshot | null>;
  listDocumentsMeta: (clientId: string) => Promise<DocumentMetaProjection[]>;
};

export async function defaultEvidenceLoaders(): Promise<EvidenceAssembleLoaders> {
  return {
    async getSafeClient(clientId) {
      const record = await getPortalIntakeCaseById(clientId);
      if (!record) return null;
      const ctx = portalCaseToContext(record, 100, ["id"]);
      return projectSafeFromResolved(ctx);
    },
    async getFinance(clientId) {
      return getPortalFinanceSnapshot(clientId);
    },
    async listDocumentsMeta(clientId) {
      const record = await getPortalIntakeCaseById(clientId);
      if (!record) return [];
      return readStaffDocuments(record.answers).map((doc) => ({
        documentId: doc.id,
        title: doc.fileName,
        category: doc.mimeType || null,
        uploadedAt: doc.createdAt ?? null,
        status: null,
      }));
    },
  };
}

export async function assembleEvidencePack(params: {
  task: CurrentTask;
  clientRef: ClientRef;
  loaders?: EvidenceAssembleLoaders;
  freshnessClass?: EvidencePack["freshnessClass"];
}): Promise<EvidencePack | null> {
  const loaders = params.loaders ?? (await defaultEvidenceLoaders());
  const safe = await loaders.getSafeClient(params.clientRef.clientId);
  if (!safe) return null;

  const needsFinance =
    params.task.requiredProjections.includes("FINANCE") ||
    params.task.requiredProjections.includes("FULL_SAFE_PROFILE");
  const needsDocs =
    params.task.requiredProjections.includes("DOCUMENT_META") ||
    params.task.requiredProjections.includes("FULL_SAFE_PROFILE");

  const [finance, documents] = await Promise.all([
    needsFinance ? loaders.getFinance(params.clientRef.clientId) : null,
    needsDocs ? loaders.listDocumentsMeta(params.clientRef.clientId) : [],
  ]);

  return buildEvidencePack({
    task: params.task,
    clientRef: params.clientRef,
    safe,
    finance,
    documents,
    freshnessClass: params.freshnessClass ?? "LIVE_FETCH",
    highSensitivityAllow: createHighSensitivityAllow(
      params.task.highSensitivityCaps,
    ),
  });
}
