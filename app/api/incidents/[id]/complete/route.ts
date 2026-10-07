import { NextResponse } from "next/server";
import { engine } from "@/lib/engine";
import { uploadEvidence } from "@/lib/engine/storage";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const form = await req.formData();
    const photo = form.get("photo");
    if (!(photo instanceof File) || photo.size === 0) return NextResponse.json({ error: "photo required" }, { status: 400 });
    const photoUrl = await uploadEvidence(photo, `completions/${id}`);
    await engine.complete(id, {
      notes: String(form.get("notes") ?? ""),
      actualDowntimeMinutes: Number(form.get("actual_downtime_minutes") ?? 0) || 0,
      photoUrl,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 409 });
  }
}
