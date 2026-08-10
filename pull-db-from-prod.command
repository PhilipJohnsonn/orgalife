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

if [[ "${1:-}" == "--check" ]]; then
  for required_command in ssh docker mktemp; do
    command -v "$required_command" >/dev/null || { echo "Missing command: $required_command"; exit 1; }
  done
  echo "Configuration OK"
  echo "Source: $VPS_USER@$VPS_HOST / $VPS_DB_NAME"
  echo "Destination: $LOCAL_CONTAINER / $LOCAL_DB_NAME"
  exit 0
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--check]" >&2
  exit 2
fi

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/orgalife-pull.XXXXXX")"
DUMP_PATH="$TEMP_DIR/production.dump"
SSH_SOCKET="$TEMP_DIR/ssh-control"
SSH_OPEN=false

cleanup() {
  local exit_code=$?
  if [[ "$SSH_OPEN" == true ]]; then
    ssh -O exit -o ControlPath="$SSH_SOCKET" "$VPS_USER@$VPS_HOST" >/dev/null 2>&1 || true
  fi
  rm -f "$DUMP_PATH" "$SSH_SOCKET"
  rmdir "$TEMP_DIR" >/dev/null 2>&1 || true
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "WARNING: this overwrites the local database only."
echo "Source: $VPS_USER@$VPS_HOST / $VPS_DB_NAME"
echo "Destination: local container $LOCAL_CONTAINER / $LOCAL_DB_NAME"
echo "Production will not be modified."
echo ""
read -r -p "Type 'overwrite-local-orgalife' to continue: " confirm
[[ "$confirm" == "overwrite-local-orgalife" ]] || { echo "Aborted."; exit 1; }

ssh -o ControlMaster=auto -o ControlPath="$SSH_SOCKET" -o ControlPersist=60 \
  -N -f "$VPS_USER@$VPS_HOST"
SSH_OPEN=true

echo "1/4 Dumping production into a private temporary archive..."
ssh -o ControlMaster=auto -o ControlPath="$SSH_SOCKET" -o ControlPersist=60 \
  "$VPS_USER@$VPS_HOST" \
  "docker exec $VPS_CONTAINER pg_dump -U $VPS_DB_USER --format=custom --no-owner --no-acl $VPS_DB_NAME" \
  > "$DUMP_PATH"
chmod 600 "$DUMP_PATH"
[[ -s "$DUMP_PATH" ]] || { echo "Production dump is empty."; exit 1; }

echo "2/4 Verifying archive structure..."
docker exec -i "$LOCAL_CONTAINER" pg_restore --list < "$DUMP_PATH" >/dev/null

echo "3/4 Recreating the local database..."
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" postgres \
  -c "DROP DATABASE IF EXISTS \"$LOCAL_DB_NAME\" WITH (FORCE);"
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" postgres \
  -c "CREATE DATABASE \"$LOCAL_DB_NAME\";"

echo "4/4 Restoring locally..."
docker exec -i "$LOCAL_CONTAINER" pg_restore -U "$LOCAL_DB_USER" \
  --no-owner --no-acl --dbname "$LOCAL_DB_NAME" < "$DUMP_PATH"

echo ""
echo "Done. Local database is now a copy of production."
