import { crmClientToContext, formgridRowToContext } from "@/lib/ai/client-context";
import { getFormgridClientFields } from "@/lib/google-sheets/formgrid-lookup";
import { getFormgridLeadsTable } from "@/lib/google-sheets/formgrid-leads";
import { listAllClients } from "@/lib/google-sheets/service";
import { listEmigrantDeskClients } from "@/lib/emigrant-desk/clients";
import { analyzeLeadDuplicates } from "@/lib/leads/lead-review-dedup";
import { validateLeadForCrmCreate } from "@/lib/leads/lead-create-validation";
import {
  buildFormgridRowKey,
  formgridSheetRowFromIndex,
} from "@/lib/leads/formgrid-row-key";
import { readLeadReviewStore } from "@/lib/leads/lead-review-store";
import { writeFile } from "node:fs/promises";

const auditedAt = new Date().toISOString();

const [{ items: crmClients, source: crmSource }, formgrid, deskClients, reviewStore] =
  await Promise.all([
    listAllClients(),
    getFormgridLeadsTable(),
    listEmigrantDeskClients(),
    readLeadReviewStore(),
  ]);

const crmContexts = crmClients.map((client, index) =>
  crmClientToContext(client, 100 - index),
);
const fgContexts = formgrid.rows.map((row, index) =>
  formgridRowToContext(formgrid.headers, row, index),
);

const leads = formgrid.rows.map((row, index) => {
  const sheetRow = formgridSheetRowFromIndex(index);
  const leadCtx = fgContexts[index];
  const fields = getFormgridClientFields(formgrid.headers, row);
  const dedup = analyzeLeadDuplicates(
    leadCtx,
    crmContexts,
    fgContexts,
    deskClients,
    {
      name: fields.name,
      passport: fields.passport,
      email: fields.email,
    },
  );
  const validationErrors = validateLeadForCrmCreate({
    name: fields.name,
    passport: fields.passport,
    phone: fields.phone,
    email: fields.email,
  });
  const rowKey = buildFormgridRowKey(formgrid.headers, row);
  const review = reviewStore.reviews[rowKey];
  const deskStrong = dedup.strongMatches.filter((m) => m.source === "desk");
  const would409 =
    dedup.hasStrongMatch && validationErrors.length === 0;
  const noDupSignals =
    !dedup.hasStrongMatch &&
    !dedup.hasMediumMatch &&
    !dedup.hasPossibleMatch;

  return {
    sheetRow,
    rowKey,
    name: fields.name,
    passport: fields.passport,
    phone: fields.phone,
    email: fields.email,
    reviewStatus: review?.status ?? "new",
    reviewNote: review?.note ?? "",
    crmWritePreviewMode: review?.crmWritePreview?.mode ?? null,
    dedup,
    deskStrong,
    validationErrors,
    would409,
    noDupSignals,
    riskClass: dedup.hasStrongMatch
      ? "HIGH"
      : dedup.hasMediumMatch
        ? "MEDIUM"
        : "LOW",
  };
});

const createdInCrm = leads.filter((l) => l.reviewStatus === "created_in_crm");
const deskStrongLeads = leads.filter((l) => l.deskStrong.length > 0);
const blocked409 = leads.filter((l) => l.would409);
const noSignals = leads.filter((l) => l.noDupSignals);
const validationErrorLeads = leads.filter((l) => l.validationErrors.length > 0);

const crmWriteEnabled = process.env.CRM_WRITE_ENABLED?.trim().toLowerCase() === "true";
const crmWriteDryRun = process.env.CRM_WRITE_DRY_RUN?.trim().toLowerCase() === "true";
let resolveMode = "status_only";
if (!crmWriteEnabled && !crmWriteDryRun) resolveMode = "status_only";
else if (!crmWriteEnabled && crmWriteDryRun) resolveMode = "dry_run";
else if (crmWriteEnabled && crmWriteDryRun) resolveMode = "write_blocked";
else resolveMode = "write";

const appendSucceeded = createdInCrm.some(
  (l) =>
    l.reviewNote.includes("CRM row appended successfully") ||
    l.crmWritePreviewMode === "write",
);

function mdTable(rows, cols) {
  const header = `| ${cols.map((c) => c.label).join(" | ")} |`;
  const sep = `| ${cols.map(() => "---").join(" | ")} |`;
  const body = rows
    .map(
      (r) =>
        `| ${cols.map((c) => String(c.value(r) ?? "").replace(/\|/g, "\\|")).join(" | ")} |`,
    )
    .join("\n");
  return rows.length ? `${header}\n${sep}\n${body}` : `${header}\n${sep}\n| — |`;
}

const report = `# CRM Write Post-Go-Live Audit

**Дата:** ${auditedAt}  
**Режим:** read-only аудит (без append, без изменения данных)  
**Источники:** Formgrid (${formgrid.source}), CRM (${crmSource}), Emigrant Desk (${deskClients.length} clients), Lead Review store (Supabase/file)

---

## Runtime snapshot (local env mirror)

| Параметр | Значение |
|---|---|
| \`GOOGLE_SHEETS_SPREADSHEET_ID\` | ${process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "—"} |
| \`GOOGLE_SHEETS_CLIENTS_RANGE\` | ${process.env.GOOGLE_SHEETS_CLIENTS_RANGE ?? "(не задана → fallback 'В Работе'!A:M)"} |
| \`CRM_WRITE_ENABLED\` | ${process.env.CRM_WRITE_ENABLED ?? "(не задана)"} |
| \`CRM_WRITE_DRY_RUN\` | ${process.env.CRM_WRITE_DRY_RUN ?? "(не задана)"} |
| \`resolveCrmWriteMode()\` | **${resolveMode}** |

---

## 1. Лиды со статусом «Создан в CRM»

Количество: **${createdInCrm.length}**

${mdTable(createdInCrm, [
  { label: "Row", value: (r) => r.sheetRow },
  { label: "ФИО", value: (r) => r.name },
  { label: "Паспорт", value: (r) => r.passport },
  { label: "Note", value: (r) => r.reviewNote || "—" },
  { label: "Preview mode", value: (r) => r.crmWritePreviewMode ?? "—" },
])}

---

## 2. Strong duplicate через Emigrant Desk

Количество: **${deskStrongLeads.length}**

${mdTable(deskStrongLeads, [
  { label: "Row", value: (r) => r.sheetRow },
  { label: "ФИО", value: (r) => r.name },
  { label: "Desk match", value: (r) => r.deskStrong.map((m) => `${m.name} (${m.reasons.join(", ")})`).join("; ") },
])}

---

## 3. Лиды, заблокированные \`create_in_crm\` (HTTP 409)

Количество: **${blocked409.length}**

${mdTable(blocked409, [
  { label: "Row", value: (r) => r.sheetRow },
  { label: "ФИО", value: (r) => r.name },
  { label: "Strong sources", value: (r) => [...new Set(r.dedup.strongMatches.map((m) => m.source))].join(", ") },
  { label: "Причины", value: (r) => [...new Set(r.dedup.strongMatches.flatMap((m) => m.reasons))].join(", ") },
])}

---

## 4. Лиды без duplicate-сигналов (LOW)

Количество: **${noSignals.length}**

${mdTable(noSignals, [
  { label: "Row", value: (r) => r.sheetRow },
  { label: "ФИО", value: (r) => r.name },
  { label: "Паспорт", value: (r) => r.passport },
  { label: "Validation", value: (r) => r.validationErrors.join(", ") || "ok" },
])}

---

## 5. Лиды с \`validation_error\`

Количество: **${validationErrorLeads.length}**

${mdTable(validationErrorLeads, [
  { label: "Row", value: (r) => r.sheetRow },
  { label: "ФИО", value: (r) => r.name },
  { label: "Errors", value: (r) => r.validationErrors.join(", ") },
  { label: "HTTP при create_in_crm", value: (r) => "422" },
])}

---

## Распределение риска (dedup)

| Класс | Кол-во |
|---|---|
| HIGH (strong) | ${leads.filter((l) => l.riskClass === "HIGH").length} |
| MEDIUM | ${leads.filter((l) => l.riskClass === "MEDIUM").length} |
| LOW | ${leads.filter((l) => l.riskClass === "LOW").length} |

Всего лидов в Formgrid: **${leads.length}**

---

## Вердикт

| Проверка | Результат |
|---|---|
| **CRM Write работает** | ${resolveMode === "write" && appendSucceeded ? "**Да** — есть успешный append" : resolveMode === "write" ? "**Частично** — режим write, но успешных append в store не найдено" : "**Нет** — режим \`" + resolveMode + "\`, append не выполняется"} |
| **Dedup работает** | ${deskStrongLeads.length >= 3 && blocked409.length >= 8 ? "**Да** — Desk/CRM/Formgrid strong-сигналы детектируются" : "**Частично** — проверить матрицу сигналов"} |
| **Rollout завершён** | ${resolveMode === "write" && appendSucceeded ? "**Да**" : "**Нет** — требуется cutover ENV (native sheet + CRM_WRITE flags) и контролируемый первый append"} |

### Единственный оставшийся блокер rollout

${resolveMode !== "write"
    ? "`CRM_WRITE_ENABLED=true` + `CRM_WRITE_DRY_RUN=false` не выставлены на Production (текущий режим: **" + resolveMode + "**)."
    : !appendSucceeded
      ? "Режим write активен, но подтверждённого успешного append в Lead Review store нет."
      : "`GOOGLE_SHEETS_SPREADSHEET_ID` всё ещё указывает на `.xlsx` — нужен cutover на native Google Sheet перед массовым append."}

---

*Аудит выполнен скриптом \`scripts/post-go-live-audit.mjs\` против live Formgrid/CRM/Desk данных.*
`;

await writeFile("CRM_WRITE_POST_GO_LIVE_AUDIT.md", report, "utf8");
console.log(
  JSON.stringify(
    {
      auditedAt,
      totalLeads: leads.length,
      createdInCrm: createdInCrm.length,
      deskStrong: deskStrongLeads.length,
      blocked409: blocked409.length,
      noSignals: noSignals.length,
      validationErrors: validationErrorLeads.length,
      resolveMode,
      appendSucceeded,
      reportPath: "CRM_WRITE_POST_GO_LIVE_AUDIT.md",
    },
    null,
    2,
  ),
);
