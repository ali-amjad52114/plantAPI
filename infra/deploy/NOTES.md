# D3 deploy notes (requests for the lead)

1. **Blocker for any build: TypeScript 7 + Next 15.** `next build` fails: "TypeScript 7.0.2 is not supported by this version of Next.js". Fix in package.json (lead-owned):
   `"typescript": "^6"` in devDependencies (then `npm install`). The Dockerfile works around it now (`npm i --no-save typescript@^6` + `typescript.ignoreBuildErrors` in a build-only next.config copy); remove that workaround after the pin.
2. **`npx tsc --noEmit` fails** under TS 7 (`Cannot find name 'Buffer'/'process'` in lib/contracts/interfaces.ts): TS 7 no longer auto-includes @types. Fix in tsconfig.json: `"types": ["node"]` in compilerOptions (or pinning TS ^6 also fixes it).
3. `next.config.mjs` already has `output: "standalone"` — no change needed.
4. Port: container listens on `$PORT`, default 8080 (`next start` script defaults to 8080 too). Deploy: `scripts/deploy.sh` → `insta deploy . --group app --port 8080`.
5. Worker binds no port; it lives in the same container (infra/deploy/entrypoint.sh supervises both, exits 1 if either dies).
6. Runtime env to set/bind on compute/app (never in the image): see CONTRACTS.md env list (OPENAI_*, AGENT37_*, SUPABASE_*, MONID_API_KEY, ODOO_*, FIIX_*, RS_*).
7. Old repo `server.js` (visits demo) and `migrations/001_visits.sql` are no longer used by the image.
