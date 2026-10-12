# ==============================================================================
# MoneyMatter Combined Container (Frontend + Backend + Embedded Redis)
# Image: ghcr.io/elwin/moneymatter/combined:latest
# ==============================================================================

ARG FRONTEND_IMAGE=ghcr.io/elwin/moneymatter/frontend:latest
ARG BACKEND_IMAGE=ghcr.io/elwin/moneymatter/backend:latest

# 📦 Source: Extract built frontend assets and nginx configuration
FROM ${FRONTEND_IMAGE} AS frontend-assets

# 🚀 Production Combined Runtime (built on top of Backend image)
FROM ${BACKEND_IMAGE} AS production

LABEL org.opencontainers.image.title="MoneyMatter Combined" \
      org.opencontainers.image.description="MoneyMatter combined container with Frontend, Backend, and embedded Redis" \
      org.opencontainers.image.source="https://github.com/elwin/moneymatter"

USER root

# Install runtime dependencies: Nginx, Redis, Supervisor, Gettext (envsubst), Curl
RUN apk add --no-cache \
    nginx \
    redis \
    supervisor \
    gettext \
    ca-certificates \
    curl

WORKDIR /app

# Create directory structure and symlink logs
RUN mkdir -p /frontend /landing \
    && mkdir -p /etc/nginx/templates /etc/nginx/includes \
    && mkdir -p /run/nginx /var/log/nginx /var/lib/nginx \
    && ln -sf /dev/stdout /var/log/nginx/access.log \
    && ln -sf /dev/stderr /var/log/nginx/error.log \
    && mkdir -p /usr/share/nginx/html \
    && printf '<html><body><h1>502 Bad Gateway</h1><p>The backend service is starting up or unavailable.</p></body></html>\n' > /usr/share/nginx/html/50x.html \
    && mkdir -p /data/redis /run/redis /var/log/redis \
    && chown -R redis:redis /data/redis /run/redis /var/log/redis

# Copy built frontend assets, nginx template, and entrypoint from frontend image
COPY --from=frontend-assets --chown=nginx:nginx /app /frontend
COPY --from=frontend-assets --chown=nginx:nginx /landing /landing
COPY --from=frontend-assets /etc/nginx/templates/nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY --from=frontend-assets /usr/local/bin/docker-entrypoint.sh /usr/local/bin/frontend-entrypoint.sh

# Copy combined configurations and scripts
COPY self-hosting/combined/redis.conf /etc/redis/redis.conf
COPY self-hosting/combined/supervisord.conf /etc/supervisord.conf
COPY self-hosting/combined/start-backend.sh /usr/local/bin/start-backend.sh
COPY self-hosting/combined/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/frontend-entrypoint.sh /usr/local/bin/start-backend.sh /usr/local/bin/docker-entrypoint.sh

# Environment defaults
ENV NODE_ENV=production \
    IS_SELF_HOST=true \
    APPLICATION_REDIS_HOST=127.0.0.1 \
    APPLICATION_HOST=127.0.0.1 \
    APPLICATION_PORT=8081 \
    BACKEND_URL=http://127.0.0.1:8081 \
    LISTEN_PORT=80 \
    FRONTEND_ROOT=/frontend \
    SKIP_LANDING=true

EXPOSE 80

VOLUME ["/app/packages/backend/data/attachments", "/data/redis"]

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
