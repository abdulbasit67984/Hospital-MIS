FROM node:22.16.0-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @hospital-mis/worker... build

FROM node:22.16.0-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=build /workspace /workspace
USER node
CMD ["node", "apps/worker/dist/index.js"]
