FROM node:20-alpine

# Install ffmpeg (for server-side audio extraction) and build tools (for bcrypt native addon)
RUN apk add --no-cache ffmpeg python3 make g++

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy application source
COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]
