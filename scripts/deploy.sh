#!/usr/bin/env bash
# Deploy PlantAPI (Next standalone + worker, one container) to InstaCloud.
# The LEAD runs this. Secrets come from InstaCloud runtime env, never the image.
#   scripts/deploy.sh --dry-run              # print commands only
#   scripts/deploy.sh [--with-env]           # really deploy; --with-env first runs
#                                            # scripts/deploy-env.sh --apply (env -> compute/app)
#   HEALTH_PATH=/ (default) is polled after deploy for HTTP 200.
set -euo pipefail
cd "$(dirname "$0")/.."

DRY=0
WITH_ENV=0
for a in "$@"; do
  case "$a" in
    --dry-run|-n) DRY=1 ;;
    --with-env) WITH_ENV=1 ;;
    -h|--help) sed -n '2,7p' "$0"; exit 0 ;;
    *) echo "unknown arg: $a" >&2; exit 2 ;;
  esac
done
HEALTH_PATH="${HEALTH_PATH:-/}"

run() {
  echo "+ $*"
  if [ "$DRY" -eq 0 ]; then "$@"; fi
}

[ -f Dockerfile ] || { echo "no Dockerfile in $(pwd)" >&2; exit 1; }

# 0. Optional: bind CONTRACTS.md env to compute/app (values never printed).
if [ "$WITH_ENV" -eq 1 ]; then
  if [ "$DRY" -eq 1 ]; then
    bash scripts/deploy-env.sh --dry-run
  else
    bash scripts/deploy-env.sh --apply
  fi
fi

# 1. Context: target, login, linked project + branch (read-only).
run insta --agent status --json
# 2. Local static readiness check of the Dockerfile (offline, nothing pushed).
run insta --agent build . --port 8080
# 3. Deploy (remote build from ./Dockerfile). Gated action: if it prints an
#    approval id, relay `insta agent approvals approve <id>` to an admin, then rerun.
DEPLOY_LOG="$(mktemp)"
echo "+ insta --agent deploy . --group app --port 8080"
if [ "$DRY" -eq 0 ]; then
  insta --agent deploy . --group app --port 8080 2>&1 | tee "$DEPLOY_LOG"
fi

# 4. Resolve the URL: from deploy output, else from the compute/app service domain.
url_from_service() {
  insta --agent service list --json 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      const a = JSON.parse(s).find(x => x.type === "compute" && x.name === "app");
      if (a && a.domain) console.log("https://" + a.domain);
    });'
}
if [ "$DRY" -eq 1 ]; then
  echo "+ URL=\$(deploy output https://... | insta --agent service list --json -> compute/app domain)"
  echo "  current compute/app URL (read-only lookup): $(url_from_service || true)"
  echo "+ curl -s -o /dev/null -w '%{http_code}' \"\$URL$HEALTH_PATH\"   # poll every 3s up to 60s, expect 200"
  echo "# dry-run: nothing deployed."
  rm -f "$DEPLOY_LOG"
  exit 0
fi

URL="$(grep -oE 'https://[A-Za-z0-9.-]+\.(instacloud-edge\.com|instacloud\.com|insta\.[a-z]+)[^ ]*' "$DEPLOY_LOG" | head -1 || true)"
[ -n "$URL" ] || URL="$(url_from_service || true)"
rm -f "$DEPLOY_LOG"
[ -n "$URL" ] || { echo "deploy finished but no URL found; run: insta --agent agent manifest --json" >&2; exit 1; }
URL="${URL%/}"
echo "DEPLOYED URL: $URL"

# 5. Health check: cold start allowed (scale-to-zero), poll up to ~60s.
code=000
for _ in $(seq 1 20); do
  code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$URL$HEALTH_PATH" || true)"
  [ "$code" = "200" ] && break
  sleep 3
done
echo "HEALTH: GET $URL$HEALTH_PATH -> $code"
[ "$code" = "200" ] || { echo "not healthy: check 'insta --agent compute logs --limit 100'" >&2; exit 1; }
