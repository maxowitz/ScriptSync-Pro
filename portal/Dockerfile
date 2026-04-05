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

# Write nginx config template with $PORT placeholder
RUN printf 'server {\n\
    listen ${PORT};\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/templates/default.conf.template

# nginx:alpine auto-processes templates in /etc/nginx/templates/
# using envsubst, replacing ${PORT} at container start

EXPOSE 80

CMD ["sh", "-c", "envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
