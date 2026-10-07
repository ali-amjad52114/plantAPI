import { NextResponse } from "next/server";
import { engine, IncidentNotFoundError } from "@/lib/engine";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as { decision?: string; by?: string; note?: string };
    if (body.decision !== "approve" && body.decision !== "reject") return NextResponse.json({ error: "decision must be approve|reject" }, { status: 400 });
    await engine.approve(id, body.decision, body.by || "Supervisor", body.note);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof IncidentNotFoundError) return NextResponse.json({ error: "incident not found" }, { status: 404 });
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 409 });
  }
}
