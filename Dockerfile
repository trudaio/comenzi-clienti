FROM node:22-slim

WORKDIR /app

# Copy package files and install dependencies (including devDeps for tsx)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Copy config files (sites, service account)
COPY config/ ./config/

# Cloud Run sets PORT=8080
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

# Use tsx to run TypeScript directly (no separate compile step needed)
CMD ["npx", "tsx", "src/server/index.ts"]
