import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export { loadEnv } from "./env";

let admin: SupabaseClient | null = null;
let browser: SupabaseClient | null = null;

function need(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

/** Service-role client. Server-only (API routes, worker, scripts). */
export function supabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") throw new Error("supabaseAdmin() is server-only");
  if (!admin) {
    admin = createClient(
      need("SUPABASE_URL", process.env.SUPABASE_URL),
      need("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return admin;
}

/** Anon-key client for the UI (read-only + realtime). */
export function supabaseBrowser(): SupabaseClient {
  if (!browser) {
    browser = createClient(
      need("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL),
      need(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY,
      ),
      { auth: { persistSession: false } },
    );
  }
  return browser;
}
