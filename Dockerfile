FROM node:26-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

# Run unprivileged. The image ships an nginx user (uid 101); it needs the
# cache and temp directories, and the listen port is already above 1024 so no
# capability is required.
RUN chown -R nginx:nginx /var/cache/nginx /usr/share/nginx/html
USER nginx

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  # 127.0.0.1, not localhost: /etc/hosts maps localhost to ::1 as well, busybox
  # wget tries the IPv6 address first and does not fall back, and nginx listens
  # on IPv4 only. With localhost this check has never passed.
  CMD wget -qO- http://127.0.0.1:5173/ || exit 1

EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
