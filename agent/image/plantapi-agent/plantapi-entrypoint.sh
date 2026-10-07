#!/bin/bash
set -euo pipefail

# ~/ is the persistent home volume (masked at build time), so the PlantAPI dirs are made at boot.
# Role skills are uploaded into ~/plantapi/skills by the backend (PUT /v1/files/content).
mkdir -p "${HOME}/plantapi/skills" "${HOME}/plantapi/reports" "${HOME}/shots"

# Hand over to the stock Hermes entrypoint: managed model, Composio, agent37 CLI, gateway on 3737.
exec /usr/local/bin/entrypoint.sh "$@"
