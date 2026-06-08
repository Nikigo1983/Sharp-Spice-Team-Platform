import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { computeCroatiaAnalytics } from "@/lib/analytics/croatia";
import { resolvePeriodRange, type PeriodPreset } from "@/lib/analytics/period";

const VALID_PRESETS = new Set<string>([
  "current_month",
  "prev_month",
  "current_quarter",
  "half_year",
  "nine_months",
  "calendar_year",
  "custom",
]);

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const presetRaw = searchParams.get("preset") ?? "current_month";
  const preset = VALID_PRESETS.has(presetRaw)
    ? (presetRaw as PeriodPreset)
    : "current_month";
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  const range = resolvePeriodRange(preset, from, to);
  const data = await computeCroatiaAnalytics(range);

  return NextResponse.json(data);
}
