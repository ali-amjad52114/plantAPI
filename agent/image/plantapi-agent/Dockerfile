# PlantAPI agent image: stock Hermes (managed model, agent37 CLI, Chromium) + Monid CLI + PlantAPI skills dir.
# Build: cloud build --name plantapi-agent --default-port 3737 (gateway on 3737 = chat API at https://{id}.agent37.app).
# Rules (docs/agents-api/templates): keep the stock entrypoint (we wrap it); bake only outside /home/node
# (persistent volume masks it), so the CLI goes to /usr/local and ~/plantapi/skills is created at boot.
# Skills themselves are not baked: they are written per instance via the files/exec API (agent/skills/roles/*.md).
FROM ghcr.io/agent37-platform/hermes:2026.10.05a

USER root
# Monid CLI (search / AgentMail / Saperly). Pinned; installed to /usr/local so the home volume cannot mask it.
RUN npm install -g --prefix /usr/local @monid-ai/cli@0.1.7 \
 && /usr/local/bin/monid --version

COPY --chmod=0755 plantapi-entrypoint.sh /usr/local/bin/plantapi-entrypoint.sh

USER node
ENTRYPOINT ["/usr/local/bin/plantapi-entrypoint.sh"]
