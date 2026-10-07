# D1 (Agent37 image + live view) - resume notes

Prep mode run 2026-10-07 15:02-15:15 (branch s/platform). Read-only Agent37 calls only. Spend $0.

## Done (committed)
- 7fde9e5 `agent/image/AGENT37_API.md` - endpoint summary. No OpenAPI served (openapi.json, /docs 404); source = official
  docs pages `https://www.agent37.com/docs/agents-api/<page>.md` + examples repo recipe @7e304600.
- 6a1f6ad `agent/image/plantapi-agent/` (FROM hermes:2026.10.05a + `@monid-ai/cli@0.1.7` in /usr/local + wrapper entrypoint that
  mkdirs ~/plantapi/skills then execs stock entrypoint) and `agent/image/hermes-vnc-desktop/` (upstream recipe, FROM pinned).
  `.gitattributes` forces LF for *.sh / Dockerfile.
- e7a15d3 `lib/agent37/provision/templates.ts` (request builders + real fetch: getTemplate, buildTemplate, createInstance,
  getInstance, deleteInstance, getLiveViewUrl/toLiveView; refuses to delete pfd5d7eukw) and `build-templates.ts` CLI
  (dry-run default, packs ustar+gzip contexts with no deps), `agent/image/dry-run.txt`.

## Verified
- Read-only GET /v1/templates: 8 system templates (agent37-hermes = hermes:2026.10.05a); GET /v1/templates/{plantapi-agent,
  hermes-vnc-desktop} = 404 (not built yet). GET /v1/instances: pfd5d7eukw (running), r9h0qk82ie (sleeping, agent37-qm, not ours).
- Packed contexts extract cleanly with `tar -tzvf`, LF endings, entrypoints `bash -n` OK. `npx tsc --noEmit` exit 0 (whole repo).

## Template ids
- None yet (builds not run).

## Next (needs lead go-ahead) - run from C:\AI\plantapi-platform, after `set -a; . ./.env; set +a`
1. `npx tsx lib/agent37/provision/build-templates.ts --live build --only hermes-vnc-desktop`  (builds are free)
2. `npx tsx lib/agent37/provision/build-templates.ts --live build --only plantapi-agent`
3. `npx tsx lib/agent37/provision/build-templates.ts --live live-view`  (creates 1 instance: auto_sleep, 300 s idle, $1 cap;
   prints vnc URL, open + screenshot while a chat turn browses)
4. `npx tsx lib/agent37/provision/build-templates.ts --live delete --id <id from step 3>`

## Open risks
- plantapi-agent build untested: `npm install -g --prefix /usr/local` as root in the hermes image assumed to work (Node present).
- Monid auth on the instance needs MONID_API_KEY via create `env` (not set in LIVE_VIEW_INSTANCE; "Add plant" should pass it).
- Budget maps to `monthly_cap_micros` (managed LLM/Brave/Composio only); compute (~$4.76/mo, per-minute) is separate.
