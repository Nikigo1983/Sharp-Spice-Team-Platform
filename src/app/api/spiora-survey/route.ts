import { NextResponse } from "next/server";
import { formatResponseAnswers } from "@/lib/spiora-survey/format";
import {
  addSpioraSurveyResponse,
  getSpioraSurveyResponse,
  listSpioraSurveyResponses,
} from "@/lib/spiora-survey/store";
import { validateSurveyPayload } from "@/lib/spiora-survey/validation";
import { getSession } from "@/lib/auth/session";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const response = await getSpioraSurveyResponse(id);
    if (!response) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      response,
      display: formatResponseAnswers(response),
    });
  }

  const items = await listSpioraSurveyResponses();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const payload = body as {
    anonymous?: boolean;
    companyName?: string | null;
    answers?: Record<string, unknown>;
    contact?: { name?: string; channel?: string } | null;
  };

  const anonymous = Boolean(payload.anonymous);
  const answers =
    payload.answers && typeof payload.answers === "object"
      ? payload.answers
      : {};

  const contact =
    payload.contact &&
    typeof payload.contact === "object" &&
    (payload.contact.name || payload.contact.channel)
      ? {
          name: String(payload.contact.name ?? "").trim(),
          channel: String(payload.contact.channel ?? "").trim(),
        }
      : null;

  const validation = validateSurveyPayload({
    anonymous,
    companyName: payload.companyName,
    answers,
    contact,
  });

  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.message, field: validation.field },
      { status: 400 },
    );
  }

  const record = await addSpioraSurveyResponse({
    anonymous,
    companyName: anonymous
      ? null
      : String(payload.companyName ?? "").trim() || null,
    answers,
    contact:
      answers.q18_contact_ok === "yes" || answers.q18_contact_ok === "maybe"
        ? contact
        : null,
  });

  return NextResponse.json({ ok: true, id: record.id });
}
