# PlantAPI — one container: Next.js standalone server + engine worker (tsx).
# No secrets are baked in: all env (OPENAI_*, SUPABASE_*, AGENT37_*, ...) comes
# from the InstaCloud runtime env.

# ---- deps: full install (tsx is a devDependency the worker needs at runtime)
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- build: next build with standalone output
FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Force standalone output inside the image even if the repo config drifts
# (temporary copy of the config, build-time only; repo file is untouched).
# Next 15 cannot load TypeScript 7 (no JS compiler API): swap in TS 6 for this
# build stage only (--no-save) and skip in-build type checks (run
# `npm run typecheck` separately). Drop both once package.json pins typescript ^6.
RUN printf '%s\n' '/** @type {import("next").NextConfig} */' \
      'export default { output: "standalone", eslint: { ignoreDuringBuilds: true }, typescript: { ignoreBuildErrors: true } };' \
      > next.config.mjs \
 && npm i --no-save --no-audit --no-fund typescript@^6 \
 && mkdir -p public \
 && npm run build

# ---- runtime
FROM node:22-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
WORKDIR /app
# Next standalone server (its own traced node_modules) + static assets + public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Worker runtime: source + full node_modules (tsx) in a separate dir
WORKDIR /worker
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY lib ./lib
COPY worker ./worker
COPY infra/deploy/entrypoint.sh /entrypoint.sh
RUN sed -i "s/\r\$//" /entrypoint.sh && chmod +x /entrypoint.sh && chown -R node:node /app /worker
USER node
WORKDIR /app
EXPOSE 8080
CMD ["/entrypoint.sh"]
