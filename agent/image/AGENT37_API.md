# Agent37 API - endpoint summary (templates, instances, live view)

Source: no OpenAPI spec is served (`/openapi.json`, `/v1/openapi.json`, `/docs` all 404 on api.agent37.com).
Summary taken from the official docs (Mintlify, fetched 2026-10-07 as `.md`):
https://www.agent37.com/docs/agents-api/{templates,custom-image,instances,budgets,desktop,urls,exec,files}.md
plus the example recipe https://github.com/agent37-platform/examples/tree/main/custom-images/hermes-vnc-desktop
(commit 7e304600). Verified read-only: `GET /v1/templates` and `GET /v1/instances` with our key.

Auth: hosting API `https://api.agent37.com/v1` with `Authorization: Bearer $AGENT37_API_KEY`.
Instance plane `https://{id}.agent37.app` (default port, 3737 gateway) and `https://{id}-{port}.agent37.app`,
same key sent as `X-Agent37-Key` (or Bearer, as lib/agent37 already does).

## Templates (images)
| Method | Path | Notes |
|---|---|---|
| GET | /v1/templates | `{data:[...]}` system catalog then workspace. Live: 8 system templates, `agent37-hermes` = `ghcr.io/agent37-platform/hermes:2026.10.05a`; no workspace templates yet |
| GET | /v1/templates/{name}[@rev] | 404 `not_found` if absent (confirmed for `plantapi-agent`, `hermes-vnc-desktop`) |
| POST | /v1/templates | register from registry `{name, image_ref, registry_auth?, description?, default_port?}` (we do not use this: no registry) |
| PATCH / DELETE | /v1/templates/{name} | update / delete workspace template |
| POST | /v1/template-builds | cloud build: `{name, size_bytes, default_port?, description?}` -> `{id: "tb_...", status:"created", upload_url, expires_at, max_bytes}` |
| PUT | {upload_url} | raw gzipped tar (Dockerfile at root), NO Agent37 key, header `Expect:` cleared. upload_url is a bearer credential: never log |
| POST | /v1/template-builds/{id}/start | optional `{secrets, registry_auth}` -> `{id, status:"building"}`; 409 `build_conflict` (max 3 concurrent), 503 `try_again` |
| GET | /v1/template-builds/{id} | status `created|building|ingesting|succeeded|failed`; on success `template:{name, revision, image_digest}`; on fail `error:{code,message}` |
| GET | /v1/template-builds/{id}/logs?offset=N | same + `{offset, data}` log chunk. Polling triggers registration |

Builds are FREE (45 min timeout, 1 GB context, 8 GB image, linux/amd64). Name regex `^[a-z][a-z0-9-]{1,62}$`, `agent37-` reserved.
CLI equivalent: `npx agent37 templates build <dir> --name <n> --default-port 3737` (not a repo dependency; we use raw fetch).

Image rules (Hermes base): keep the stock entrypoint (wrap it, then `exec /usr/local/bin/entrypoint.sh "$@"`);
bake only outside `/home/node` and `/home/linuxbrew` (persistent volumes mask them), i.e. `/usr/local` or `/opt`;
skills are NOT baked: write them at runtime via exec/files API; run as `node`, `USER root` only for installs.
FROM targets: `ghcr.io/agent37-platform/hermes:<tag>` (stock, keeps managed model + agent37 CLI; used by the VNC recipe)
or `ghcr.io/agent37-platform/hermes-base:<tag>` (clean, no model wired).

## Instances
| Method | Path | Notes |
|---|---|---|
| POST | /v1/instances | 201 full object once `running`. Body (all optional): `template` (name[@rev]), `resources {cpu,memory,disk}` (2/4 default, $4.76/mo), `type`, `name`, `user`, `metadata`, `env` (<=64 string vars), `budget {monthly_cap_micros, credit_micros}` (default 0 = managed calls refused), `auto_sleep` (bool, default false), `idle_timeout_seconds` (300..86400, default 900), `public_ports` |
| GET | /v1/instances, /v1/instances/{id} | list / one; 404 for unknown |
| PATCH | /v1/instances/{id} | `name, user, metadata, auto_sleep, idle_timeout_seconds` |
| DELETE | /v1/instances/{id} | `{id, deleted:true}`; destructive, ends billing; repeat -> 404 |
| POST | /v1/instances/{id}/{stop,start,restart,update,resize,fork,backups,restore} | lifecycle |
| GET/PATCH | /v1/instances/{id}/budget | budget object; POST .../budget/top-up |
| GET | /v1/instances/{id}/usage | `{period, total_micros, by_integration}` |

Budget = ceiling on managed LLM/Brave/Composio usage in micros ($1 = 1_000_000). Compute (~$4.76/mo for 2/4,
metered per minute) is billed separately while running; sleeping/stopped bills disk only. Live now: `pfd5d7eukw`
(running, agent37-hermes, auto_sleep true) and `r9h0qk82ie` (sleeping, agent37-qm) - neither is ours to touch.

## Live view (VNC)
- Template `hermes-vnc-desktop` (recipe in `agent/image/hermes-vnc-desktop/`) serves noVNC on port 6901.
- `POST /v1/instances/{id}/signed-url` `{port: 6901, ttl_seconds: 60..604800 (default 3600)}` -> `{url, domain_urls, port, ...}`
  with `?a37_token=...`. Open `https://{id}-6901.agent37.app/vnc.html?a37_token=...&autoconnect=1&resize=scale[&view_only=1]`
  in a top-level tab. Do not iframe (SameSite=Lax cookie); for embedding connect noVNC RFB to
  `wss://{id}-6901.agent37.app/websockify?a37_token=...`. Token grants full control and cannot be revoked: use short TTL.
- Opening it wakes a sleeping instance; an open view counts as activity (keeps it awake).

## Exec and files (already used by lib/agent37)
- `POST /v1/instances/{id}/exec` `{command, user?: "root"}` -> `{exit_code, stdout, stderr, truncated}` (512 KB caps); wakes sleepers.
- Instance plane: `GET /v1/files?path=`, `GET /v1/files/content?path=`, `PUT /v1/files/content?path=` (raw body, mkdir -p),
  `GET /v1/files/archive?path=`, `POST /v1/files/dir?path=`, `DELETE /v1/files?path=` (rm -rf).
- Health: `GET https://{id}.agent37.app/v1/health` until `"healthy": true` before the first chat turn.
- Boot hooks: `~/.agent37/hooks/post-restart.sh` (every boot) and `post-image-update.sh`.
