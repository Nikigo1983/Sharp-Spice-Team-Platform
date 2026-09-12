import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  buildReviewRows,
  getPublishedSchema,
  getSubmittedForStaff,
  isCaseArchived,
  listSubmittedForStaff,
  markQuestionnaireOpenedByStaff,
  readProcessStatus,
  readStaffDocuments,
  readStaffNotes,
  updateCaseArchiveState,
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
import { pickLabel } from "@/lib/client-portal/questionnaire-types";
import { PROCESS_STATUS_OPTIONS } from "@/lib/client-portal/process-status";

function toListItem(item: Awaited<ReturnType<typeof listSubmittedForStaff>>[number]) {
  const identity = readLegacyIdentity(item.answers);
  const displayName =
    identity?.fullNameCyrillic ||
    identity?.fullNameLatin ||
    String(item.answers.full_name_cyrillic ?? "").trim() ||
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
    isNew: !item.staffOpenedAt && !isCaseArchived(item.answers),
    isLegacy: isLegacyCrmImport(item.answers),
    isArchived: isCaseArchived(item.answers),
    staffFields: readStaffFields(item.answers),
    processStatus: readProcessStatus(item.answers, item.status),
  };
}

function sortByName<T extends { displayName?: string; firstName: string; email: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) =>
    (a.displayName || a.firstName || a.email).localeCompare(
      b.displayName || b.firstName || b.email,
      "ru",
      { sensitivity: "base", numeric: true },
    ),
  );
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
    const record = opened ?? (await getSubmittedForStaff(id));
    if (!record) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({
      schemaTitle: isLegacyCrmImport(record.answers)
        ? "Старая база клиентов (CRM)"
        : pickLabel(getPublishedSchema().title, "ru"),
      questionnaire: record,
      staffFields: readStaffFields(record.answers),
      notes: readStaffNotes(record.answers),
      documents: readStaffDocuments(record.answers),
      processStatus: readProcessStatus(record.answers, record.status),
      processStatusOptions: PROCESS_STATUS_OPTIONS,
      review: buildReviewRows(record.answers, "ru"),
      isLegacy: isLegacyCrmImport(record.answers),
      isArchived: isCaseArchived(record.answers),
    });
  }

  const all = (await listSubmittedForStaff()).map(toListItem);
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

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = (await request.json()) as {
    id?: string;
    staffFields?: Partial<QuestionnaireStaffFields>;
    archived?: boolean;
  };

  if (!body.id) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
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
    return NextResponse.json({
      item: toListItem(record),
      staffFields: readStaffFields(record.answers),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SAVE_FAILED";
    const status = message === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
