# ---------- Build stage ----------
FROM node:20-alpine AS build

WORKDIR /app

COPY portal/package.json portal/package-lock.json* ./
RUN npm install

COPY portal/ .

# Build with the API URL injected at build time
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ---------- Serve stage ----------
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

# SPA routing config
RUN cat > /etc/nginx/conf.d/default.conf << 'NGINX'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
