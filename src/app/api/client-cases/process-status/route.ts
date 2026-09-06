import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  updateSubmittedProcessStatus,
} from "@/lib/client-portal/questionnaire-service";

function requestOrigin(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (proto && host) return `${proto}://${host}`;
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (env) return env;
  return new URL(request.url).origin;
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = (await request.json()) as {
    questionnaireId?: string;
    status?: string;
  };
  if (!body.questionnaireId || typeof body.status !== "string") {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const result = await updateSubmittedProcessStatus(body.questionnaireId, {
      status: body.status,
      updatedByUserId: session.id,
      updatedByName: session.name,
      portalOrigin: requestOrigin(request),
    });
    return NextResponse.json({
      processStatus: result.processStatus,
      emailSent: result.emailSent,
      unchanged: result.unchanged,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SAVE_FAILED";
    const status =
      message === "NOT_FOUND"
        ? 404
        : message === "INVALID_STATUS"
          ? 400
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
