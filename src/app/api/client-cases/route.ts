import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  buildReviewRows,
  getPublishedSchema,
  getSubmittedForStaff,
  listSubmittedForStaff,
} from "@/lib/client-portal/questionnaire-service";
import { pickLabel } from "@/lib/client-portal/questionnaire-types";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const record = await getSubmittedForStaff(id);
    if (!record) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({
      schemaTitle: pickLabel(getPublishedSchema().title, "ru"),
      questionnaire: record,
      review: buildReviewRows(record.answers, "ru"),
    });
  }

  const items = await listSubmittedForStaff();
  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      email: item.email,
      firstName: item.firstName,
      lastName: String(
        item.answers.full_name_latin ??
          item.answers.full_name_cyrillic ??
          item.answers.last_name ??
          "",
      ),
      serviceType: String(item.answers.citizenship_latin ?? ""),
      submittedAt: item.submittedAt,
    })),
  });
}
