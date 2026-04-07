#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_HOST="ovhsui.3mate.io"
DEFAULT_PORT="10122"
DEFAULT_USER="root"
DEFAULT_REMOTE_DIR="/opt/levo"
DEFAULT_WEB_ENV_FILE="$ROOT_DIR/apps/web/.env"
DEFAULT_SIGNER_ENV_FILE="$ROOT_DIR/apps/nautilus-signer/.env"
DEFAULT_HEALTHCHECK_URL="http://127.0.0.1:10101/"

HOST="${LEVO_DEPLOY_HOST:-$DEFAULT_HOST}"
PORT="${LEVO_DEPLOY_PORT:-$DEFAULT_PORT}"
USER_NAME="${LEVO_DEPLOY_USER:-$DEFAULT_USER}"
REMOTE_DIR="${LEVO_DEPLOY_REMOTE_DIR:-$DEFAULT_REMOTE_DIR}"
WEB_ENV_FILE="${LEVO_DEPLOY_WEB_ENV_FILE:-$DEFAULT_WEB_ENV_FILE}"
SIGNER_ENV_FILE="${LEVO_DEPLOY_SIGNER_ENV_FILE:-$DEFAULT_SIGNER_ENV_FILE}"
DRY_RUN=0
SKIP_ENV=0
HEALTHCHECK_URL="${LEVO_DEPLOY_HEALTHCHECK_URL:-$DEFAULT_HEALTHCHECK_URL}"

usage() {
  cat <<'EOF'
Usage: scripts/deploy-rsync.sh [options]

Options:
  --host <host>           SSH host (default: ovhsui.3mate.io)
  --port <port>           SSH port (default: 10122)
  --user <user>           SSH user (default: root)
  --remote-dir <path>     Remote deploy dir (default: /opt/levo)
  --web-env-file <path>   Web env file to upload (default: apps/web/.env)
  --signer-env-file <path>
                          Signer env file to upload (default: apps/nautilus-signer/.env)
  --healthcheck-url <url>  Remote healthcheck URL (default: http://127.0.0.1:10101/)
  --skip-env              Skip env file validation and upload (use existing remote .env)
  --dry-run               Print rsync actions without modifying remote files
  --help                  Show this message
EOF
}

require_file() {
  local target="$1"
  if [[ ! -f "$target" ]]; then
    echo "Missing required file: $target" >&2
    exit 1
  fi
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

read_env_value() {
  local key="$1"
  local file_path="$2"
  local line
  line="$(grep -E "^${key}=" "$file_path" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi

  local value="${line#*=}"
  if [[ "$value" =~ ^\".*\"$ ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" =~ ^\'.*\'$ ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

is_remote_host() {
  [[ "$HOST" != "localhost" && "$HOST" != "127.0.0.1" && "$HOST" != "::1" ]]
}

validate_web_env_file() {
  local database_url
  database_url="$(read_env_value DATABASE_URL "$WEB_ENV_FILE" || true)"
  if [[ -z "$database_url" ]]; then
    echo "Missing DATABASE_URL in $WEB_ENV_FILE" >&2
    exit 1
  fi

  if is_remote_host && [[ "${LEVO_DEPLOY_ALLOW_LOCAL_DB:-0}" != "1" ]]; then
    if [[ "$database_url" == *"@localhost:"* || "$database_url" == *"@127.0.0.1:"* || "$database_url" == *"@[::1]:"* ]]; then
      echo "Refusing to deploy to remote host $HOST with local DATABASE_URL from $WEB_ENV_FILE" >&2
      echo "Use a server-specific env file via --web-env-file, or set LEVO_DEPLOY_ALLOW_LOCAL_DB=1 to override." >&2
      exit 1
    fi
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --user)
      USER_NAME="$2"
      shift 2
      ;;
    --remote-dir)
      REMOTE_DIR="$2"
      shift 2
      ;;
    --web-env-file)
      WEB_ENV_FILE="$2"
      shift 2
      ;;
    --signer-env-file)
      SIGNER_ENV_FILE="$2"
      shift 2
      ;;
    --healthcheck-url)
      HEALTHCHECK_URL="$2"
      shift 2
      ;;
    --skip-env)
      SKIP_ENV=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_command rsync
require_command ssh
require_file "$ROOT_DIR/scripts/rsync-excludes.txt"
if [[ "$SKIP_ENV" -eq 0 ]]; then
  require_file "$WEB_ENV_FILE"
  require_file "$SIGNER_ENV_FILE"
  validate_web_env_file
fi

SSH_TARGET="${USER_NAME}@${HOST}"
SSH_CMD=(ssh -p "$PORT")
RSYNC_SSH="ssh -p $PORT"
RSYNC_ARGS=(
  -az
  --delete
  --exclude-from="$ROOT_DIR/scripts/rsync-excludes.txt"
  --filter='P /.git/'
  -e "$RSYNC_SSH"
)

ENV_RSYNC_ARGS=(
  -az
  -e "$RSYNC_SSH"
)

if [[ "$DRY_RUN" -eq 1 ]]; then
  RSYNC_ARGS+=(--dry-run --itemize-changes)
  ENV_RSYNC_ARGS+=(--dry-run --itemize-changes)
fi

echo "[deploy-rsync] target: ${SSH_TARGET}:${REMOTE_DIR}"
echo "[deploy-rsync] web env: ${WEB_ENV_FILE}"
echo "[deploy-rsync] signer env: ${SIGNER_ENV_FILE}"
echo "[deploy-rsync] healthcheck: ${HEALTHCHECK_URL}"

"${SSH_CMD[@]}" "$SSH_TARGET" "mkdir -p '$REMOTE_DIR' '$REMOTE_DIR/apps/web' '$REMOTE_DIR/apps/nautilus-signer'"

echo "[deploy-rsync] syncing source tree"
rsync "${RSYNC_ARGS[@]}" "$ROOT_DIR/" "${SSH_TARGET}:${REMOTE_DIR}/"

if [[ "$SKIP_ENV" -eq 0 ]]; then
  echo "[deploy-rsync] syncing runtime env files"
  rsync "${ENV_RSYNC_ARGS[@]}" "$WEB_ENV_FILE" "${SSH_TARGET}:${REMOTE_DIR}/apps/web/.env"
  rsync "${ENV_RSYNC_ARGS[@]}" "$SIGNER_ENV_FILE" "${SSH_TARGET}:${REMOTE_DIR}/apps/nautilus-signer/.env"
else
  echo "[deploy-rsync] skipping env sync (using remote .env)"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[deploy-rsync] dry-run complete"
  exit 0
fi

echo "[deploy-rsync] running remote install/build/migrate/restart"
"${SSH_CMD[@]}" "$SSH_TARGET" "bash -lc '
set -euo pipefail
cd \"$REMOTE_DIR\"

pnpm install --frozen-lockfile
pnpm --filter web build

cd apps/web
npx prisma migrate deploy
cd ../..

supervisorctl restart levo-signer levo-web
supervisorctl status levo-signer levo-web

curl -fsS \"$HEALTHCHECK_URL\" >/dev/null
'"

echo "[deploy-rsync] deployment finished"
