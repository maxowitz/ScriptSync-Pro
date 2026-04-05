# ---------- Build stage ----------
FROM node:20-alpine AS build

WORKDIR /app

COPY portal/package.json portal/package-lock.json* ./
RUN npm install

COPY portal/ .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ---------- Serve stage ----------
FROM node:20-alpine

WORKDIR /app

RUN npm install -g serve

COPY --from=build /app/dist ./dist

ENV PORT=3000

CMD ["sh", "-c", "serve -s dist -l $PORT"]
