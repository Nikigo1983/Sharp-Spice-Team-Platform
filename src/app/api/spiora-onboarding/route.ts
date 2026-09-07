import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { formatOnboardingAnswers } from "@/lib/spiora-onboarding/format";
import {
  addOnboardingResponse,
  getOnboardingResponse,
  listOnboardingResponses,
} from "@/lib/spiora-onboarding/store";
import {
  companyNameFromAnswers,
  validateOnboardingPayload,
} from "@/lib/spiora-onboarding/validation";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const response = await getOnboardingResponse(id);
    if (!response) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      response,
      display: formatOnboardingAnswers(response),
    });
  }

  const items = await listOnboardingResponses();
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

  const answers =
    "answers" in body && body.answers && typeof body.answers === "object"
      ? (body.answers as Record<string, unknown>)
      : {};

  const validation = validateOnboardingPayload(answers);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.message, field: validation.field },
      { status: 400 },
    );
  }

  const record = await addOnboardingResponse({
    companyName: companyNameFromAnswers(answers),
    contactName: String(answers.contact_name ?? "").trim() || null,
    contactEmail: String(answers.contact_email ?? "").trim() || null,
    answers,
  });

  return NextResponse.json({ ok: true, id: record.id });
}
