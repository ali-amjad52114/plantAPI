#!/usr/bin/env bash
# Deploy PlantAPI (Next standalone + worker, one container) to InstaCloud.
# The LEAD runs this. Secrets come from InstaCloud runtime env, never the image.
#   scripts/deploy.sh --dry-run   # print commands only
#   scripts/deploy.sh             # really deploy
set -euo pipefail
cd "$(dirname "$0")/.."

DRY=0
for a in "$@"; do
  case "$a" in
    --dry-run|-n) DRY=1 ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) echo "unknown arg: $a" >&2; exit 2 ;;
  esac
done

run() {
  echo "+ $*"
  if [ "$DRY" -eq 0 ]; then "$@"; fi
}

[ -f Dockerfile ] || { echo "no Dockerfile in $(pwd)" >&2; exit 1; }

# 1. Context: target, login, linked project + branch (read-only).
run insta status --json
# 2. Local static readiness check of the Dockerfile (offline, nothing pushed).
run insta build . --port 8080
# 3. Deploy (remote build from ./Dockerfile). Gated action: if it prints an
#    approval id, relay `insta agent approvals approve <id>` to an admin, then rerun.
run insta deploy . --group app --port 8080

if [ "$DRY" -eq 1 ]; then
  echo "# dry-run: nothing executed. After a real deploy, verify the printed URL returns 200:"
  echo "#   curl -s -o /dev/null -w '%{http_code}' <URL>"
fi
