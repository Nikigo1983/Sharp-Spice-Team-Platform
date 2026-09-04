import { NextResponse } from "next/server";
import { getClientSession } from "@/lib/client-portal/session";
import {
  calculateProgress,
  submitQuestionnaire,
} from "@/lib/client-portal/questionnaire-service";
import type { QuestionnaireAnswers } from "@/lib/client-portal/questionnaire-types";

export async function POST(request: Request) {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = (await request.json()) as {
    id?: string;
    answers?: QuestionnaireAnswers;
    expectedRevision?: number;
  };
  if (!body.id) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const record = await submitQuestionnaire(
      session,
      body.id,
      body.answers,
      body.expectedRevision,
    );
    return NextResponse.json({
      questionnaire: record,
      progress: calculateProgress(record.answers),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SUBMIT_FAILED";
    if (message.startsWith("MISSING_REQUIRED:")) {
      return NextResponse.json(
        {
          error: "MISSING_REQUIRED",
          fields: message.replace("MISSING_REQUIRED:", "").split(", "),
        },
        { status: 400 },
      );
    }
    const status =
      message === "NOT_FOUND"
        ? 404
        : message === "REVISION_CONFLICT"
          ? 409
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
