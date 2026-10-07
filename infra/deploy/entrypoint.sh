#!/bin/sh
# Tiny supervisor: run Next (standalone) + worker; if either exits, stop both
# and exit non-zero so the platform restarts the container.
set -u
PORT="${PORT:-8080}"; export PORT
HOSTNAME="${HOSTNAME:-0.0.0.0}"; export HOSTNAME

node /app/server.js &
WEB=$!
( cd /worker && exec node_modules/.bin/tsx worker/index.ts ) &
WORKER=$!
echo "supervisor: web pid=$WEB (port $PORT), worker pid=$WORKER"

term() { kill -TERM "$WEB" "$WORKER" 2>/dev/null; wait; exit 0; }
trap term INT TERM

# Poll: POSIX sh has no `wait -n`.
while kill -0 "$WEB" 2>/dev/null && kill -0 "$WORKER" 2>/dev/null; do sleep 2; done
if kill -0 "$WEB" 2>/dev/null; then echo "supervisor: worker exited, stopping"; else echo "supervisor: web exited, stopping"; fi
kill -TERM "$WEB" "$WORKER" 2>/dev/null
wait
exit 1
