import { NextResponse } from "next/server";
import { readQuestionnaireAttachmentFile } from "@/lib/client-portal/questionnaire-attachment-storage";
import {
  findFileAnswerInRecord,
  getOrCreateQuestionnaire,
} from "@/lib/client-portal/questionnaire-service";
import { getClientSession } from "@/lib/client-portal/session";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await context.params;
  const record = await getOrCreateQuestionnaire(session);
  const owned = findFileAnswerInRecord(record, id);
  if (!owned) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const file = await readQuestionnaireAttachmentFile(
    session.id,
    owned.id,
    owned.fileName,
  );
  if (!file) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return new Response(new Uint8Array(file.data), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(owned.fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
