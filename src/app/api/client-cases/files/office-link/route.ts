import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isWordDocumentFileName } from "@/lib/client-portal/questionnaire-attachment-formats";
import {
  isWordOpenUrlWithinLimit,
  mintCompactCaseFileToken,
  toMsWordOpenUri,
} from "@/lib/client-portal/case-file-access-token";
import {
  findFileAnswerInRecord,
  getSubmittedForStaff,
} from "@/lib/client-portal/questionnaire-service";

export const runtime = "nodejs";

function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (url.protocol === "https:" ? "https" : "http");
  return `${proto}://${host}`;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: { questionnaireId?: string; fileId?: string };
  try {
    body = (await request.json()) as {
      questionnaireId?: string;
      fileId?: string;
    };
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const questionnaireId = body.questionnaireId?.trim();
  const fileId = body.fileId?.trim();
  if (!questionnaireId || !fileId) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const record = await getSubmittedForStaff(questionnaireId);
  if (!record) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const owned = findFileAnswerInRecord(record, fileId);
  if (!owned) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (!isWordDocumentFileName(owned.fileName)) {
    return NextResponse.json({ error: "NOT_WORD" }, { status: 400 });
  }

  let compactToken: string;
  try {
    compactToken = mintCompactCaseFileToken({
      fileId,
      questionnaireId,
      expiresInSec: 600,
    });
  } catch {
    return NextResponse.json({ error: "INVALID_IDS" }, { status: 400 });
  }

  // Short path — Word protocol document URL must stay under ~256 characters.
  const fileUrl = `${requestOrigin(request)}/api/client-cases/w/${compactToken}`;
  if (!isWordOpenUrlWithinLimit(fileUrl)) {
    console.error("[office-link] document URL still too long for Word", {
      length: fileUrl.length,
    });
    return NextResponse.json({ error: "URL_TOO_LONG" }, { status: 500 });
  }

  return NextResponse.json({
    fileName: owned.fileName,
    fileUrl,
    msWordUri: toMsWordOpenUri(fileUrl),
    urlLength: fileUrl.length,
  });
}
