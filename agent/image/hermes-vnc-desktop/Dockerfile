# Upstream: github.com/agent37-platform/examples custom-images/hermes-vnc-desktop @ 7e304600 (unchanged except FROM pinned
# to the current agent37-hermes tag 2026.10.05a for reproducible rebuilds). Build: --name hermes-vnc-desktop --default-port 3737.
# noVNC on port 6901; open via POST /v1/instances/{id}/signed-url {port:6901} then /vnc.html.
# Hermes with a live desktop: watch the agent browse in real time, and take over when it needs you.
#
# Built on the stock agent37-hermes image, so everything managed stays: the managed model,
# Composio, Brave, paid tools, the `agent37` CLI and its cron skill, and the approval and
# browser defaults. That image already ships Chromium, Xvfb, and openbox, and its entrypoint
# brings up a virtual display on :99. This image adds the three missing pieces: x11vnc (the
# VNC server), noVNC (the web client), and websockify (its WebSocket bridge). It also starts a
# visible Chromium the agent drives over the DevTools protocol.
FROM ghcr.io/agent37-platform/hermes:2026.10.05a

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
      x11vnc novnc websockify x11-utils \
 && rm -rf /var/lib/apt/lists/*

# Hermes' browser tool launches its own *headless* Chromium by default, which a desktop
# view can't see. This points it at the visible Chromium below instead, so the desktop
# shows the browser the agent is actually driving.
ENV BROWSER_CDP_URL=http://127.0.0.1:9222

COPY --chmod=0755 desktop-entrypoint.sh /usr/local/bin/desktop-entrypoint.sh

USER node
ENTRYPOINT ["/usr/local/bin/desktop-entrypoint.sh"]
