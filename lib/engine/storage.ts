// Uploads evidence photos to the Supabase `evidence` bucket (public read) and returns the public URL.
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/db";

export async function uploadEvidence(file: File, prefix: string): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const key = `${prefix}/${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin().storage.from("evidence").upload(key, bytes, { contentType: file.type || "image/jpeg" });
  if (error) throw new Error(`evidence upload: ${error.message}`);
  return supabaseAdmin().storage.from("evidence").getPublicUrl(key).data.publicUrl;
}
