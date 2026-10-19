# One image runs the web app (`pnpm start`) and the job worker (`pnpm jobs`).
FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN npm install -g pnpm@10.34.7
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:24-bookworm-slim AS run
WORKDIR /app
RUN npm install -g pnpm@10.34.7
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app ./
USER node
EXPOSE 3000
CMD ["pnpm", "start"]
