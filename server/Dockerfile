FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @camarote/shared build && pnpm --filter @camarote/server build
ENV NODE_ENV=production
EXPOSE 3333
CMD ["sh", "-c", "node server/dist/migrate.js && node server/dist/seed-admin.js && exec node server/dist/index.js"]
