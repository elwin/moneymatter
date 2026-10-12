#!/bin/sh
set -eu

echo "=== MoneyMatter Combined Initialization ==="

# --- Validation: Guard against dummy secrets --------------------------------
for var in APPLICATION_JWT_SECRET APP_SESSION_ID_SECRET BETTER_AUTH_SECRET APPLICATION_DB_PASSWORD; do
  eval "value=\"\${$var:-}\""
  case "$value" in
    __REPLACE_ME__*)
      echo "ERROR: $var is still set to placeholder '__REPLACE_ME__'." >&2
      echo "Generate a real secret (e.g. openssl rand -base64 32) and pass it as an environment variable." >&2
      exit 1
      ;;
  esac
done

# Defaults for combined container
if [ -z "${APPLICATION_REDIS_HOST:-}" ] || [ "${APPLICATION_REDIS_HOST}" = "redis" ]; then
  export APPLICATION_REDIS_HOST="127.0.0.1"
fi
export APPLICATION_HOST="${APPLICATION_HOST:-127.0.0.1}"
export APPLICATION_PORT="${APPLICATION_PORT:-8081}"
export BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8081}"
export IS_SELF_HOST="${IS_SELF_HOST:-true}"
export LISTEN_PORT="${LISTEN_PORT:-80}"
export FRONTEND_ROOT="${FRONTEND_ROOT:-/frontend}"
export SKIP_LANDING="${SKIP_LANDING:-true}"

# Prepare directories & permissions
mkdir -p /app/packages/backend/data/attachments
chown -R nodejs:nodejs /app/packages/backend/data

mkdir -p /data/redis
chown -R redis:redis /data/redis

mkdir -p /run/nginx /var/log/nginx /var/lib/nginx
chown -R nginx:nginx /var/log/nginx /var/lib/nginx

# Delegate frontend runtime config shim and Nginx setup to the shared frontend entrypoint
echo "Combined initialization complete. Delegating to frontend entrypoint..."
exec /usr/local/bin/frontend-entrypoint.sh "$@"
