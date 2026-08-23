# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@9 --activate
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Stage 2: Production image
FROM python:3.12-slim
WORKDIR /app

# Install backend
COPY backend/pyproject.toml backend/
RUN pip install --no-cache-dir -e ./backend

# Install nginx
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy built frontend
COPY --from=frontend-build /app/public ./public
COPY --from=frontend-build /app/.next/static ./.next/static

# Copy backend code
COPY backend/ ./backend/
COPY docker/entrypoint.sh ./
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
VOLUME /app/data
ENTRYPOINT ["./entrypoint.sh"]
