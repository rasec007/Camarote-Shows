FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @camarote/shared build
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @camarote/mobile build

FROM nginx:1.27-alpine
ARG NGINX_CONFIG=nginx.standalone.conf
COPY mobile/${NGINX_CONFIG} /etc/nginx/conf.d/default.conf
COPY --from=build /repo/mobile/dist /usr/share/nginx/html
EXPOSE 80
