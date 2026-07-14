FROM node:22.16.0-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.13.0 --activate
WORKDIR /workspace
COPY . .
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_SOCKET_URL=http://localhost:3000
ARG VITE_SOCKET_PATH=/socket.io
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
ENV VITE_SOCKET_PATH=$VITE_SOCKET_PATH
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @hospital-mis/web... build

FROM nginx:1.29.1-alpine AS runtime
COPY infrastructure/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 80
