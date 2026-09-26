import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  ensureQuestionnaireWordDocument,
  readStaffDocuments,
} from "@/lib/client-portal/questionnaire-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: { questionnaireId?: string };
  try {
    body = (await request.json()) as { questionnaireId?: string };
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const questionnaireId = body.questionnaireId?.trim();
  if (!questionnaireId) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const result = await ensureQuestionnaireWordDocument(questionnaireId, {
      force: true,
    });
    return NextResponse.json({
      document: result.document,
      documents: readStaffDocuments(result.record.answers),
      created: result.created,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "NOT_FOUND") {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    console.error("[questionnaire-word] ensure failed", error);
    return NextResponse.json({ error: "FAILED" }, { status: 500 });
  }
}
