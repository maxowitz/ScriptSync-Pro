FROM node:20-alpine

# Install ffmpeg and build tools for bcrypt native addon
RUN apk add --no-cache ffmpeg python3 make g++

WORKDIR /app

# Install dependencies first (better layer caching)
COPY server/package.json server/package-lock.json* ./
RUN npm install

# Copy Prisma schema and generate client
COPY server/prisma ./prisma
RUN npx prisma generate

# Copy application source
COPY server/src ./src

# Create storage directory
RUN mkdir -p /app/storage

EXPOSE 3000

CMD ["node", "src/index.js"]
