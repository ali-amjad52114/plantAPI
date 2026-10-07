// Minimal .env loader (no dotenv dep). Never overrides already-set vars.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(cwd: string = process.cwd()): void {
  for (const file of [".env", ".env.local"]) {
    const p = resolve(cwd, file);
    if (!existsSync(p)) continue;
    for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined || process.env[key] === "") process.env[key] = val;
    }
  }
}
