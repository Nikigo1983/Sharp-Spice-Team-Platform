import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  addStaffCaseNote,
  deleteStaffCaseNote,
  readStaffNotes,
  updateStaffCaseNote,
} from "@/lib/client-portal/questionnaire-service";
import { setStaffCaseNotesLastSeen } from "@/lib/client-portal/staff-notes-last-seen";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = (await request.json()) as {
    questionnaireId?: string;
    text?: string;
    markSeen?: boolean;
  };
  if (!body.questionnaireId) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  if (body.markSeen === true) {
    const at = new Date().toISOString();
    await setStaffCaseNotesLastSeen(session.id, body.questionnaireId, at);
    return NextResponse.json({ ok: true, notesLastSeenAt: at });
  }

  if (typeof body.text !== "string") {
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

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = (await request.json()) as {
    questionnaireId?: string;
    noteId?: string;
    text?: string;
  };
  if (
    !body.questionnaireId ||
    !body.noteId ||
    typeof body.text !== "string"
  ) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const { notes } = await updateStaffCaseNote(
      body.questionnaireId,
      body.noteId,
      body.text,
    );
    return NextResponse.json({ notes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SAVE_FAILED";
    const status =
      message === "NOT_FOUND" ? 404 : message === "EMPTY_NOTE" ? 400 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  let questionnaireId = searchParams.get("questionnaireId");
  let noteId = searchParams.get("id") ?? searchParams.get("noteId");

  if (!questionnaireId || !noteId) {
    try {
      const body = (await request.json()) as {
        questionnaireId?: string;
        noteId?: string;
      };
      questionnaireId = questionnaireId || body.questionnaireId || null;
      noteId = noteId || body.noteId || null;
    } catch {
      // body optional when query params present
    }
  }

  if (!questionnaireId || !noteId) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const { notes } = await deleteStaffCaseNote(questionnaireId, noteId);
    return NextResponse.json({ ok: true, notes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DELETE_FAILED";
    const status = message === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
