import { NextResponse } from "next/server";
import { IncidentNotFoundError, replan } from "@/lib/engine";

export const runtime = "nodejs";

/** POST /api/incidents/:id/replan — re-runs the coordinator (+ risk) under the current rules. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await replan(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof IncidentNotFoundError) return NextResponse.json({ error: "incident not found" }, { status: 404 });
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 409 });
  }
}
