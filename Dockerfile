# The Cloud Run image for apps/api.
#
# There is no compile step: tsconfig.base.json sets noEmit, so `make build` typechecks and
# emits nothing, and the service runs its TypeScript source under Node's type stripping —
# the same way `npm run dev` does. That keeps one runtime path, not a dev one and a prod one.
#
# Only the API workspace and what it depends on (@aitutor/shared) are installed and copied.
# The web app is built and served elsewhere (Firebase Hosting; see scripts/deploy.sh).
#
# scripts/check-deployable.sh --image proves this builds on every merge to main, and --run
# proves the container starts and answers on $PORT. Neither needs a cloud credential.

FROM node:24-slim

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

# Manifests first, so the install layer is reused until a dependency changes.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --workspace @aitutor/api --include-workspace-root=false \
  && npm cache clean --force

# Then the source the API imports at runtime.
COPY packages/shared/src packages/shared/src
COPY apps/api/src apps/api/src

USER node
EXPOSE 8080

CMD ["node", "--experimental-strip-types", "apps/api/src/index.ts"]
