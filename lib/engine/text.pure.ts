// UTF-8 text that went through a cp1252 decode upstream (agent tool output) arrives as mojibake:
// "18:47–19:32" → "18:47â€“19:32". Our own decoding is UTF-8 everywhere (res.json()/res.text()), so we
// repair it when we store agent output and feed events.

// cp1252 code points 0x80–0x9F that differ from latin1, mapped back to their byte.
const CP1252: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a,
  "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

const SUSPECT = /[ÂÃâ][\u0080-¿€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/;

/** Re-decodes cp1252-mangled UTF-8 runs; leaves correct text untouched. */
export function fixMojibake(s: string): string {
  if (!SUSPECT.test(s)) return s;
  // Repair run by run: a run = a lead byte char (Â-ô range) followed by 1–3 continuation-looking chars.
  return s.replace(/[Â-ô][\u0080-¿€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]{1,3}/g, (run) => {
    const bytes: number[] = [];
    for (const ch of run) {
      const code = ch.charCodeAt(0);
      const b = CP1252[ch] ?? (code <= 0xff ? code : -1);
      if (b < 0) return run;
      bytes.push(b);
    }
    const decoded = Buffer.from(bytes).toString("utf8");
    return decoded.includes("�") ? run : decoded;
  });
}

/** fixMojibake on every string in a JSON value. */
export function deepFixText<T>(v: T): T {
  if (typeof v === "string") return fixMojibake(v) as T;
  if (Array.isArray(v)) return v.map(deepFixText) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepFixText(x)])) as T;
  return v;
}
