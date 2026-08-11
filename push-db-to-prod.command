#!/bin/bash
set -Eeuo pipefail

cd "$(dirname "$0")"
umask 077

VPS_USER="deploy"
VPS_HOST="129.226.84.76"
VPS_DB_USER="admin"
VPS_DB_NAME="orgalife"
VPS_CONTAINER="postgres"

LOCAL_DB_USER="orgalife"
LOCAL_DB_NAME="orgalife"
LOCAL_CONTAINER="orgalife-db"

BACKUP_ROOT="${ORGALIFE_BACKUP_DIR:-$HOME/Backups/orgalife}"

if [[ "${1:-}" == "--check" ]]; then
  for required_command in ssh docker shasum mktemp; do
    command -v "$required_command" >/dev/null || { echo "Missing command: $required_command"; exit 1; }
  done
  echo "Configuration OK"
  echo "Source: $LOCAL_CONTAINER / $LOCAL_DB_NAME"
  echo "Destination: $VPS_USER@$VPS_HOST / $VPS_DB_NAME"
  echo "Pre-push backup directory: $BACKUP_ROOT"
  exit 0
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--check]" >&2
  exit 2
fi

BACKUP_TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PROD_BACKUP_PATH="$BACKUP_ROOT/orgalife-prod-before-push-$BACKUP_TIMESTAMP.dump"
PROD_CHECKSUM_PATH="$PROD_BACKUP_PATH.sha256"

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/orgalife-push.XXXXXX")"
LOCAL_DUMP_PATH="$TEMP_DIR/local.dump"
SSH_SOCKET="$TEMP_DIR/ssh-control"
SSH_OPEN=false
APP_STOPPED=false

cleanup() {
  local exit_code=$?

  if [[ "$APP_STOPPED" == true ]]; then
    ssh -o ControlMaster=auto -o ControlPath="$SSH_SOCKET" -o ControlPersist=60 \
      "$VPS_USER@$VPS_HOST" "cd ~/orgalife && docker compose start app" >/dev/null 2>&1 || true
  fi

  if [[ "$SSH_OPEN" == true ]]; then
    ssh -O exit -o ControlPath="$SSH_SOCKET" "$VPS_USER@$VPS_HOST" >/dev/null 2>&1 || true
  fi

  rm -f "$LOCAL_DUMP_PATH" "$SSH_SOCKET"
  rmdir "$TEMP_DIR" >/dev/null 2>&1 || true

  if [[ "$exit_code" -ne 0 ]]; then
    echo "Push failed. Production backup retained at: $PROD_BACKUP_PATH" >&2
  fi
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"

echo "DANGER: this replaces the production database with the local database."
echo "Source: local container $LOCAL_CONTAINER / $LOCAL_DB_NAME"
echo "Destination: $VPS_USER@$VPS_HOST / $VPS_DB_NAME"
echo "A production backup will be created before any DROP."
echo ""
read -r -p "Type 'replace-production-orgalife' to continue: " confirm
[[ "$confirm" == "replace-production-orgalife" ]] || { echo "Aborted."; exit 1; }

ssh -o ControlMaster=auto -o ControlPath="$SSH_SOCKET" -o ControlPersist=60 \
  -N -f "$VPS_USER@$VPS_HOST"
SSH_OPEN=true

echo "1/6 Backing up production before any destructive action..."
ssh -o ControlMaster=auto -o ControlPath="$SSH_SOCKET" -o ControlPersist=60 \
  "$VPS_USER@$VPS_HOST" \
  "docker exec $VPS_CONTAINER pg_dump -U $VPS_DB_USER --format=custom --no-owner --no-acl $VPS_DB_NAME" \
  > "$PROD_BACKUP_PATH"
chmod 600 "$PROD_BACKUP_PATH"
[[ -s "$PROD_BACKUP_PATH" ]] || { echo "Production backup is empty; aborting before DROP."; exit 1; }
docker exec -i "$LOCAL_CONTAINER" pg_restore --list < "$PROD_BACKUP_PATH" >/dev/null
shasum -a 256 "$PROD_BACKUP_PATH" > "$PROD_CHECKSUM_PATH"
chmod 600 "$PROD_CHECKSUM_PATH"

echo "2/6 Dumping local database..."
docker exec "$LOCAL_CONTAINER" pg_dump -U "$LOCAL_DB_USER" --format=custom \
  --no-owner --no-acl "$LOCAL_DB_NAME" > "$LOCAL_DUMP_PATH"
chmod 600 "$LOCAL_DUMP_PATH"
[[ -s "$LOCAL_DUMP_PATH" ]] || { echo "Local dump is empty; aborting before DROP."; exit 1; }
docker exec -i "$LOCAL_CONTAINER" pg_restore --list < "$LOCAL_DUMP_PATH" >/dev/null

echo "3/6 Stopping the production app..."
ssh -o ControlMaster=auto -o ControlPath="$SSH_SOCKET" -o ControlPersist=60 \
  "$VPS_USER@$VPS_HOST" "cd ~/orgalife && docker compose stop app"
APP_STOPPED=true

echo "4/6 Recreating the production database..."
ssh -o ControlMaster=auto -o ControlPath="$SSH_SOCKET" -o ControlPersist=60 \
  "$VPS_USER@$VPS_HOST" \
  "docker exec $VPS_CONTAINER psql -U $VPS_DB_USER postgres -c 'DROP DATABASE IF EXISTS \"$VPS_DB_NAME\" WITH (FORCE);'"
ssh -o ControlMaster=auto -o ControlPath="$SSH_SOCKET" -o ControlPersist=60 \
  "$VPS_USER@$VPS_HOST" \
  "docker exec $VPS_CONTAINER psql -U $VPS_DB_USER postgres -c 'CREATE DATABASE \"$VPS_DB_NAME\";'"

echo "5/6 Restoring local data into production..."
ssh -o ControlMaster=auto -o ControlPath="$SSH_SOCKET" -o ControlPersist=60 \
  "$VPS_USER@$VPS_HOST" \
  "docker exec -i $VPS_CONTAINER pg_restore -U $VPS_DB_USER --no-owner --no-acl --dbname $VPS_DB_NAME" \
  < "$LOCAL_DUMP_PATH"

echo "6/6 Starting the production app..."
ssh -o ControlMaster=auto -o ControlPath="$SSH_SOCKET" -o ControlPersist=60 \
  "$VPS_USER@$VPS_HOST" "cd ~/orgalife && docker compose start app"
APP_STOPPED=false

echo ""
echo "Done. Production now contains the local database."
echo "Pre-push production backup: $PROD_BACKUP_PATH"
echo "Checksum: $PROD_CHECKSUM_PATH"
