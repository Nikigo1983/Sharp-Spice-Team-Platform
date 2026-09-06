import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  addStaffCaseNote,
  readStaffNotes,
} from "@/lib/client-portal/questionnaire-service";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = (await request.json()) as {
    questionnaireId?: string;
    text?: string;
  };
  if (!body.questionnaireId || typeof body.text !== "string") {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const { record, note } = await addStaffCaseNote(body.questionnaireId, {
      text: body.text,
      authorUserId: session.id,
      authorName: session.name,
    });
    return NextResponse.json({
      note,
      notes: readStaffNotes(record.answers),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SAVE_FAILED";
    const status =
      message === "NOT_FOUND" ? 404 : message === "EMPTY_NOTE" ? 400 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
