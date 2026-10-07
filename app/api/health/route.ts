// Health check for the InstaCloud deploy: Supabase reachable + the engine worker polled recently.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_MS = Number(process.env.PLANTAPI_WORKER_STALE_MS ?? 60_000);

export async function GET() {
  let supabase = false;
  let workerLastPoll: string | null = null;
  let workerInfo: unknown = null;
  try {
    const res = await supabaseAdmin().from("worker_heartbeat").select("last_poll,info").order("last_poll", { ascending: false }).limit(1);
    supabase = !res.error;
    workerLastPoll = res.data?.[0]?.last_poll ?? null;
    workerInfo = res.data?.[0]?.info ?? null;
  } catch {
    supabase = false;
  }
  const workerAgeMs = workerLastPoll ? Date.now() - Date.parse(workerLastPoll) : null;
  const workerOk = workerAgeMs !== null && workerAgeMs < STALE_MS;
  const ok = supabase && workerOk;
  return NextResponse.json(
    { ok, supabase, worker_ok: workerOk, worker_last_poll: workerLastPoll, worker_age_s: workerAgeMs === null ? null : Math.round(workerAgeMs / 1000), worker: workerInfo },
    { status: ok ? 200 : 503 },
  );
}
