import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  buildReviewRows,
  createManualCaseForStaff,
  ensureQuestionnaireFileDocuments,
  ensureQuestionnaireWordDocument,
  getPublishedSchema,
  getSchemaForRecord,
  getSubmittedForStaff,
  isCaseArchived,
  listSubmittedForStaff,
  markApplicationSubmittedByStaff,
  markQuestionnaireOpenedByStaff,
  readProcessStatus,
  readStaffDocuments,
  readStaffNotes,
  deleteSubmittedCaseForStaff,
  updateCaseArchiveState,
  updateLegacyCaseSheetFields,
  updateFormgridCrmOpsFields,
  updateSubmittedAnswerFields,
  updateSubmittedStaffFields,
} from "@/lib/client-portal/questionnaire-service";
import {
  EMPTY_STAFF_FIELDS,
  readStaffFields,
  type QuestionnaireStaffFields,
} from "@/lib/client-portal/staff-fields";
import {
  isLegacyCrmImport,
  readLegacyIdentity,
} from "@/lib/client-portal/legacy-crm";
import { isFormgridImport, readFormgridCrmOpsSheet } from "@/lib/client-portal/formgrid-import";
import { formatCyrillicNameIof, surnameSortKey } from "@/lib/client-portal/person-name-order";
import { resolveIntakeClientSource } from "@/lib/client-portal/client-source";
import { pickLabel } from "@/lib/client-portal/questionnaire-types";
import { PROCESS_STATUS_OPTIONS } from "@/lib/client-portal/process-status";
import {
  resolveStaffCaseCountry,
  vnzhCountryLabelRu,
} from "@/lib/client-portal/questionnaire-templates";
import {
  applyFinanceContractAmount,
  loadFinanceContractAmountLabels,
  syncStaffContractAmountToFinance,
} from "@/lib/finance/intake-contract-amount";
import { isPortalNewClientBadge } from "@/lib/client-portal/questionnaire-new";

function staffFieldsForList(
  answers: Record<string, unknown>,
): QuestionnaireStaffFields {
  const staff = { ...readStaffFields(answers) };
  const crm = readFormgridCrmOpsSheet(answers);
  const legacySheet =
    answers.__legacySheet &&
    typeof answers.__legacySheet === "object" &&
    !Array.isArray(answers.__legacySheet)
      ? (answers.__legacySheet as Record<string, unknown>)
      : null;

  const fromSheet = (label: string): string => {
    const crmVal = crm[label as keyof typeof crm];
    if (typeof crmVal === "string" && crmVal.trim()) return crmVal.trim();
    if (legacySheet) {
      const v = String(legacySheet[label] ?? "").trim();
      if (v) return v;
    }
    return "";
  };

  if (!staff.lawyer.trim()) {
    const lawyer = fromSheet("Адвокат");
    if (lawyer) staff.lawyer = lawyer;
  }
  if (!staff.bookingDate.trim()) {
    const booking = fromSheet("Дата букинга (от и до)");
    if (booking) staff.bookingDate = booking;
  }

  return staff;
}

function toListItem(item: Awaited<ReturnType<typeof listSubmittedForStaff>>[number]) {
  const identity = readLegacyIdentity(item.answers);
  const source = resolveIntakeClientSource(item.answers);
  const vnzhCountry = resolveStaffCaseCountry(item);
  const rawCyrillic =
    identity?.fullNameCyrillic ||
    String(item.answers.full_name_cyrillic ?? "").trim();
  const displayName =
    (rawCyrillic ? formatCyrillicNameIof(rawCyrillic) : "") ||
    identity?.fullNameLatin ||
    String(item.answers.full_name_latin ?? "").trim() ||
    [item.firstName, String(item.answers.last_name ?? "")]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    item.email;
  return {
    id: item.id,
    email: identity?.email || item.email,
    displayName,
    firstName: item.firstName,
    lastName: String(
      identity?.fullNameLatin ||
        item.answers.full_name_latin ||
        item.answers.full_name_cyrillic ||
        item.answers.last_name ||
        "",
    ),
    serviceType: String(
      identity?.direction || item.answers.citizenship_latin || "",
    ),
    submittedAt: item.submittedAt,
    isNew: isPortalNewClientBadge(item),
    isLegacy: source === "legacy",
    isFormgrid: source === "formgrid",
    isManual: source === "manual",
    source,
    vnzhCountry,
    vnzhCountryLabel: vnzhCountryLabelRu(vnzhCountry),
    isArchived: isCaseArchived(item.answers),
    staffFields: staffFieldsForList(item.answers),
    processStatus: readProcessStatus(item.answers, item.status),
  };
}

function sortByName<T extends { displayName?: string; firstName: string; email: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const nameA = a.displayName || a.firstName || a.email;
    const nameB = b.displayName || b.firstName || b.email;
    const bySurname = surnameSortKey(nameA).localeCompare(
      surnameSortKey(nameB),
      "ru",
      { sensitivity: "base", numeric: true },
    );
    if (bySurname !== 0) return bySurname;
    return nameA.localeCompare(nameB, "ru", {
      sensitivity: "base",
      numeric: true,
    });
  });
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const view = searchParams.get("view"); // active | archive | all

  if (id) {
    const opened = await markQuestionnaireOpenedByStaff(id);
    let record = opened ?? (await getSubmittedForStaff(id));
    if (!record) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    try {
      const ensured = await ensureQuestionnaireFileDocuments(record.id);
      record = ensured.record;
    } catch (error) {
      console.error("[client-cases] ensure questionnaire file docs failed", error);
    }
    try {
      const word = await ensureQuestionnaireWordDocument(record.id);
      record = word.record;
    } catch (error) {
      console.error("[client-cases] ensure questionnaire Word failed", error);
    }
    const financeAmounts = await loadFinanceContractAmountLabels();
    const staffFields = applyFinanceContractAmount(
      {
        id: record.id,
        staffFields: readStaffFields(record.answers),
      },
      financeAmounts,
    ).staffFields;
    return NextResponse.json({
      schemaTitle: isLegacyCrmImport(record.answers) || isFormgridImport(record.answers)
        ? "Анкета клиента"
        : resolveIntakeClientSource(record.answers) === "manual"
          ? "Клиент добавлен вручную"
          : pickLabel(getSchemaForRecord(record).title, "ru"),
      questionnaire: record,
      staffFields,
      notes: readStaffNotes(record.answers),
      documents: readStaffDocuments(record.answers),
      processStatus: readProcessStatus(record.answers, record.status),
      processStatusOptions: PROCESS_STATUS_OPTIONS,
      review: buildReviewRows(record.answers, "ru"),
      isLegacy: isLegacyCrmImport(record.answers),
      isFormgrid: isFormgridImport(record.answers),
      isManual: resolveIntakeClientSource(record.answers) === "manual",
      source: resolveIntakeClientSource(record.answers),
      isArchived: isCaseArchived(record.answers),
    });
  }

  const allRaw = (await listSubmittedForStaff()).map(toListItem);
  const financeAmounts = await loadFinanceContractAmountLabels();
  const all = allRaw.map((item) =>
    applyFinanceContractAmount(item, financeAmounts),
  );
  const items = sortByName(
    view === "archive"
      ? all.filter((item) => item.isArchived)
      : view === "all"
        ? all
        : all.filter((item) => !item.isArchived),
  );
  return NextResponse.json({
    items,
    counts: {
      active: all.filter((item) => !item.isArchived).length,
      archive: all.filter((item) => item.isArchived).length,
    },
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = (await request.json()) as {
    email?: string;
    firstName?: string;
    fullNameCyrillic?: string;
    phone?: string;
  };

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const firstName =
    typeof body.firstName === "string" ? body.firstName.trim() : "";
  if (!email || !firstName) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "";
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (host ? `${proto}://${host}` : "http://localhost:3000");

  try {
    const created = await createManualCaseForStaff({
      email,
      firstName,
      fullNameCyrillic:
        typeof body.fullNameCyrillic === "string"
          ? body.fullNameCyrillic
          : undefined,
      phone: typeof body.phone === "string" ? body.phone : undefined,
      createdByUserId: session.id,
      createdByName: session.name,
      origin,
    });

    return NextResponse.json({
      item: toListItem(created.record),
      temporaryPassword: created.temporaryPassword,
      loginUrl: created.loginUrl,
      emailSent: created.emailSent,
      emailWarning: created.emailSent
        ? undefined
        : created.emailError === "EMAIL_NOT_CONFIGURED"
          ? "Письмо не отправлено: на сервере не задан RESEND_API_KEY. Скопируйте пароль и передайте клиенту вручную."
          : "Не удалось отправить письмо. Скопируйте пароль и передайте клиенту вручную.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CREATE_FAILED";
    if (message === "EMAIL_TAKEN" || message === "CASE_EXISTS") {
      return NextResponse.json(
        { error: message, message: "Клиент с этим email уже есть в портале." },
        { status: 409 },
      );
    }
    if (message === "INVALID_INVITE" || message === "INVALID_BODY") {
      return NextResponse.json(
        { error: message, message: "Укажите имя и корректный email." },
        { status: 400 },
      );
    }
    console.error("[client-cases] POST create manual", error);
    return NextResponse.json({ error: "CREATE_FAILED" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = (await request.json()) as {
    id?: string;
    staffFields?: Partial<QuestionnaireStaffFields>;
    archived?: boolean;
    applicationSubmitted?: boolean;
    legacySheet?: Record<string, string>;
    crmOpsSheet?: Record<string, string>;
    answerFields?: Record<string, string>;
  };

  if (!body.id) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    if (body.applicationSubmitted === true) {
      const { record, changed } = await markApplicationSubmittedByStaff(
        body.id,
        {
          submittedByUserId: session.id,
          submittedByName: session.name,
        },
      );
      return NextResponse.json({
        item: toListItem(record),
        staffFields: readStaffFields(record.answers),
        changed,
      });
    }

    if (typeof body.archived === "boolean") {
      const record = await updateCaseArchiveState(body.id, {
        archived: body.archived,
        archivedByUserId: session.id,
        archivedByName: session.name,
      });
      return NextResponse.json({
        item: toListItem(record),
        staffFields: readStaffFields(record.answers),
      });
    }

    if (body.legacySheet && typeof body.legacySheet === "object") {
      const record = await updateLegacyCaseSheetFields(body.id, body.legacySheet);
      return NextResponse.json({
        item: toListItem(record),
        staffFields: readStaffFields(record.answers),
        review: buildReviewRows(record.answers, "ru"),
        isLegacy: true,
      });
    }

    if (body.answerFields && typeof body.answerFields === "object") {
      const record = await updateSubmittedAnswerFields(
        body.id,
        body.answerFields,
        body.crmOpsSheet && typeof body.crmOpsSheet === "object"
          ? body.crmOpsSheet
          : null,
      );
      return NextResponse.json({
        item: toListItem(record),
        staffFields: readStaffFields(record.answers),
        review: buildReviewRows(record.answers, "ru"),
        isLegacy: isLegacyCrmImport(record.answers),
      });
    }

    if (body.crmOpsSheet && typeof body.crmOpsSheet === "object") {
      const record = await updateFormgridCrmOpsFields(body.id, body.crmOpsSheet);
      return NextResponse.json({
        item: toListItem(record),
        staffFields: readStaffFields(record.answers),
        review: buildReviewRows(record.answers, "ru"),
        isFormgrid: isFormgridImport(record.answers),
        isLegacy: false,
      });
    }

    if (!body.staffFields || typeof body.staffFields !== "object") {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }

    const patch: Partial<QuestionnaireStaffFields> = {};
    for (const key of Object.keys(EMPTY_STAFF_FIELDS) as Array<
      keyof QuestionnaireStaffFields
    >) {
      const value = body.staffFields[key];
      if (typeof value === "string") patch[key] = value;
    }

    const record = await updateSubmittedStaffFields(body.id, patch);
    if (typeof patch.contractAmount === "string") {
      await syncStaffContractAmountToFinance(
        session,
        body.id,
        patch.contractAmount,
      );
    }
    const financeAmounts = await loadFinanceContractAmountLabels();
    const item = applyFinanceContractAmount(toListItem(record), financeAmounts);
    return NextResponse.json({
      item,
      staffFields: item.staffFields,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SAVE_FAILED";
    const status =
      message === "NOT_FOUND"
        ? 404
        : message === "NOT_LEGACY"
          ? 400
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    await deleteSubmittedCaseForStaff(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DELETE_FAILED";
    const status = message === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
