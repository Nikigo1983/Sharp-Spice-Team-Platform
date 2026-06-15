import { NextResponse } from "next/server";
import { listLeadReviewQueue } from "@/lib/leads/lead-review-service";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await listLeadReviewQueue();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[api/crm/leads]", error);
    return NextResponse.json(
      { error: "Не удалось загрузить очередь лидов" },
      { status: 500 },
    );
  }
}
