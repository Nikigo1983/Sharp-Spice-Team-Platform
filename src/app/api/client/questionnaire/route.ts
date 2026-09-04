import { NextResponse } from "next/server";
import { getClientSession } from "@/lib/client-portal/session";
import {
  calculateProgress,
  getOrCreateQuestionnaire,
  getPublishedSchema,
  saveQuestionnaireAnswers,
} from "@/lib/client-portal/questionnaire-service";

export async function GET() {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const record = await getOrCreateQuestionnaire(session);
  return NextResponse.json({
    schema: getPublishedSchema(),
    questionnaire: record,
    progress: calculateProgress(record.answers),
  });
}

export async function PATCH(request: Request) {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = (await request.json()) as {
    id?: string;
    answers?: Record<string, unknown>;
    expectedRevision?: number;
  };

  if (!body.id || !body.answers || typeof body.expectedRevision !== "number") {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const record = await saveQuestionnaireAnswers(session, {
      id: body.id,
      answers: body.answers,
      expectedRevision: body.expectedRevision,
    });
    return NextResponse.json({
      questionnaire: record,
      progress: calculateProgress(record.answers),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SAVE_FAILED";
    const status =
      code === "REVISION_CONFLICT"
        ? 409
        : code === "ALREADY_SUBMITTED"
          ? 400
          : code === "NOT_FOUND"
            ? 404
            : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
