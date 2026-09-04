import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { readQuestionnaireAttachmentFile } from "@/lib/client-portal/questionnaire-attachment-storage";
import {
  findFileAnswerInRecord,
  getSubmittedForStaff,
} from "@/lib/client-portal/questionnaire-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await context.params;
  const questionnaireId = new URL(request.url).searchParams.get(
    "questionnaireId",
  );
  if (!questionnaireId) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const record = await getSubmittedForStaff(questionnaireId);
  if (!record) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const owned = findFileAnswerInRecord(record, id);
  if (!owned) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const file = await readQuestionnaireAttachmentFile(
    record.clientPortalUserId,
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
