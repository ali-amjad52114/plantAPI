// POST /api/demo/reset {force?, by?} → queues one demo reset for the worker; { reset_id }. 409 if one is active.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { force?: boolean; by?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // empty body is fine
  }
  const db = supabaseAdmin();
  const active = await db.from("demo_resets").select("id,status").in("status", ["queued", "running"]).limit(1);
  if (active.data?.length) return NextResponse.json({ error: "a demo reset is already in progress", reset_id: active.data[0].id, status: active.data[0].status }, { status: 409 });
  const ins = await db.from("demo_resets").insert({ status: "queued", force: body.force === true, requested_by: body.by ?? null }).select("id").single();
  if (ins.error) {
    // unique index: another request won the race
    if ((ins.error as { code?: string }).code === "23505") return NextResponse.json({ error: "a demo reset is already in progress" }, { status: 409 });
    return NextResponse.json({ error: ins.error.message }, { status: 500 });
  }
  return NextResponse.json({ reset_id: ins.data.id });
}
