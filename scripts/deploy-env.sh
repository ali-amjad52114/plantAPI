#!/usr/bin/env bash
# Bind every CONTRACTS.md env var to the InstaCloud compute service from the
# local .env + .env.local (.env.local wins). VALUES ARE NEVER PRINTED: each value
# is piped on stdin to `insta --agent secrets set <NAME> --service <target>`, so it
# appears in neither output nor argv.
#   scripts/deploy-env.sh [--dry-run]            # DEFAULT: names + redacted commands only
#   scripts/deploy-env.sh --apply [--target compute/app] [--branch main]
# NOTE (insta CLI >= 0.0.78): every `secrets set` REDEPLOYS the target service
# with the new value (one redeploy per variable). Gated: secrets.write — if a
# command prints an approval id, relay `insta agent approvals approve <id>` to an
# admin and rerun. Values must be non-empty plain ASCII.
set -euo pipefail
cd "$(dirname "$0")/.."

VARS=(
  OPENAI_API_KEY OPENAI_MODEL_FAST OPENAI_MODEL_SMART
  AGENT37_API_KEY AGENT37_BASE_URL AGENT37_INSTANCE_ID
  SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
  MONID_API_KEY
  ODOO_URL ODOO_DB ODOO_API_KEY ODOO_MCP_URL ODOO_MCP_TOKEN
  FIIX_URL FIIX_USERNAME FIIX_PASSWORD RS_USERNAME RS_PASSWORD
)

DRY=1
TARGET="compute/app"
BRANCH=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run|-n) DRY=1 ;;
    --apply) DRY=0 ;;
    --target) TARGET="$2"; shift ;;
    --branch) BRANCH="$2"; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

# Parse KEY=VALUE lines without sourcing (no shell evaluation of values).
declare -A VAL SRC
load() {
  local f="$1" line k v
  [ -f "$f" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    k="${BASH_REMATCH[2]}"; v="${BASH_REMATCH[3]}"
    if [[ "$v" =~ ^\"(.*)\"[[:space:]]*$ ]] || [[ "$v" =~ ^\'(.*)\'[[:space:]]*$ ]]; then
      v="${BASH_REMATCH[1]}"
    else
      v="${v%%[[:space:]]#*}"; v="${v%"${v##*[![:space:]]}"}"
    fi
    VAL[$k]="$v"; SRC[$k]="$f"
  done < "$f"
}
load .env
load .env.local

BR=()
[ -n "$BRANCH" ] && BR=(--branch "$BRANCH")

echo "# deploy-env: target=$TARGET${BRANCH:+ branch=$BRANCH} mode=$([ $DRY -eq 1 ] && echo dry-run || echo APPLY)"
missing=0
for k in "${VARS[@]}"; do
  if [ -z "${VAL[$k]+x}" ] || [ -z "${VAL[$k]}" ]; then
    echo "MISSING $k (not set or empty in .env/.env.local)" >&2
    missing=$((missing + 1))
    continue
  fi
  if LC_ALL=C grep -q '[^ -~]' <<<"${VAL[$k]}"; then
    echo "INVALID $k (non-ASCII value; insta rejects it)" >&2
    missing=$((missing + 1))
    continue
  fi
  echo "+ printf '%s' '<redacted from ${SRC[$k]}>' | insta --agent secrets set $k --service $TARGET ${BR[*]:-}"
  if [ "$DRY" -eq 0 ]; then
    printf '%s' "${VAL[$k]}" | insta --agent secrets set "$k" --service "$TARGET" "${BR[@]}"
    echo "  ok $k"
  fi
done

echo "# ${#VARS[@]} vars, $missing missing/invalid"
if [ "$DRY" -eq 1 ]; then
  echo "# dry-run: nothing executed. Apply with: scripts/deploy-env.sh --apply"
  echo "# verify names afterwards (names only): insta --agent secrets list"
fi
[ "$missing" -eq 0 ] || exit 1
