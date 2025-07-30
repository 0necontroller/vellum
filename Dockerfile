FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-slim AS runner

# Install FFmpeg and dependencies for Shaka Packager
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Shaka Packager
RUN curl -L https://github.com/shaka-project/shaka-packager/releases/download/v3.4.2/packager-linux-x64 -o /usr/local/bin/packager \
    && chmod +x /usr/local/bin/packager

WORKDIR /app
COPY --from=builder /app/build ./build
COPY package*.json ./
RUN npm ci --only=production

ENV NODE_ENV=production
EXPOSE 8001

CMD ["node", "build/app.js"]
