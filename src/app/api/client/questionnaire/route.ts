import { NextResponse } from "next/server";
import { getClientSession } from "@/lib/client-portal/session";
import {
  calculateProgress,
  getOrCreateQuestionnaire,
  getSchemaForRecord,
  saveQuestionnaireAnswers,
} from "@/lib/client-portal/questionnaire-service";
import {
  needsVnzhCountrySelection,
  VNZH_COUNTRY_OPTIONS,
  isVnzhCountry,
  VNZH_COUNTRY_ANSWER_KEY,
  hasQuestionnaireContentBeyondCountry,
  readVnzhCountry,
} from "@/lib/client-portal/questionnaire-templates";

export async function GET() {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const record = await getOrCreateQuestionnaire(session);
  const needsCountry = needsVnzhCountrySelection(record);
  const schema = needsCountry ? null : getSchemaForRecord(record);
  return NextResponse.json({
    schema,
    needsCountrySelection: needsCountry,
    countryOptions: VNZH_COUNTRY_OPTIONS.map((opt) => ({
      value: opt.value,
      label: opt.labelRu,
    })),
    questionnaire: record,
    progress: needsCountry
      ? 0
      : calculateProgress(record.answers, getSchemaForRecord(record)),
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
    vnzhCountry?: string;
  };

  if (!body.id || typeof body.expectedRevision !== "number") {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    // Country selection for brand-new clients
    if (body.vnzhCountry !== undefined) {
      if (!isVnzhCountry(body.vnzhCountry)) {
        return NextResponse.json({ error: "INVALID_COUNTRY" }, { status: 400 });
      }
      const current = await getOrCreateQuestionnaire(session);
      if (current.id !== body.id) {
        return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      }
      if (current.status !== "draft") {
        return NextResponse.json({ error: "ALREADY_SUBMITTED" }, { status: 400 });
      }
      const existing = readVnzhCountry(current.answers);
      if (
        existing &&
        existing !== body.vnzhCountry &&
        hasQuestionnaireContentBeyondCountry(current.answers)
      ) {
        return NextResponse.json({ error: "COUNTRY_LOCKED" }, { status: 400 });
      }
      const record = await saveQuestionnaireAnswers(session, {
        id: body.id,
        answers: {
          ...current.answers,
          [VNZH_COUNTRY_ANSWER_KEY]: body.vnzhCountry,
        },
        expectedRevision: body.expectedRevision,
      });
      return NextResponse.json({
        questionnaire: record,
        schema: getSchemaForRecord(record),
        needsCountrySelection: false,
        progress: calculateProgress(record.answers, getSchemaForRecord(record)),
      });
    }

    if (!body.answers) {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }

    const record = await saveQuestionnaireAnswers(session, {
      id: body.id,
      answers: body.answers,
      expectedRevision: body.expectedRevision,
    });
    return NextResponse.json({
      questionnaire: record,
      schema: getSchemaForRecord(record),
      needsCountrySelection: needsVnzhCountrySelection(record),
      progress: calculateProgress(
        record.answers,
        getSchemaForRecord(record),
      ),
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
