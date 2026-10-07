import { NextResponse } from "next/server";
import { engine, emit } from "@/lib/engine";
import { uploadEvidence } from "@/lib/engine/storage";
import { supabaseAdmin } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const alarmText = String(form.get("alarm_text") ?? "").trim();
    const photo = form.get("photo");
    if (!alarmText && !(photo instanceof File)) return NextResponse.json({ error: "alarm_text or photo required" }, { status: 400 });

    const db = supabaseAdmin();
    const plant = await db.from("plants").select("id").order("created_at").limit(1).single();
    if (plant.error) throw new Error(`no plant: ${plant.error.message}`);
    const photoUrl = photo instanceof File && photo.size > 0 ? await uploadEvidence(photo, "incidents") : null;

    const ins = await db
      .from("incidents")
      .insert({ plant_id: plant.data.id, title: alarmText.split("\n")[0].slice(0, 120) || "Equipment failure", alarm_text: alarmText, photo_url: photoUrl, status: "NEW" })
      .select("id")
      .single();
    if (ins.error) throw new Error(ins.error.message);
    const id = ins.data.id as string;
    await emit({ incident_id: id, agent: "human", kind: "status", system: "supabase", message: "Failure reported from dashboard" });
    await engine.start(id);
    return NextResponse.json({ incident_id: id });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
