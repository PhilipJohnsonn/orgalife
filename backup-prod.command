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
LOCAL_CONTAINER="orgalife-db"

BACKUP_ROOT="${ORGALIFE_BACKUP_DIR:-$HOME/Backups/orgalife}"

if [[ "${1:-}" == "--check" ]]; then
  for required_command in ssh docker shasum mktemp; do
    command -v "$required_command" >/dev/null || { echo "Missing command: $required_command"; exit 1; }
  done
  echo "Configuration OK"
  echo "Source: $VPS_USER@$VPS_HOST / $VPS_DB_NAME"
  echo "Backup directory: $BACKUP_ROOT"
  echo "Scratch restore container: $LOCAL_CONTAINER"
  exit 0
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--check]" >&2
  exit 2
fi

BACKUP_TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_PATH="$BACKUP_ROOT/orgalife-prod-$BACKUP_TIMESTAMP.dump"
CHECKSUM_PATH="$BACKUP_PATH.sha256"
MANIFEST_PATH="$BACKUP_PATH.manifest"
VERIFY_DB="orgalife_verify_${BACKUP_TIMESTAMP//[^0-9]/}"

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/orgalife-backup.XXXXXX")"
SSH_SOCKET="$TEMP_DIR/ssh-control"
SSH_OPEN=false
VERIFY_DB_CREATED=false

cleanup() {
  local exit_code=$?

  if [[ "$VERIFY_DB_CREATED" == true ]]; then
    docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" postgres \
      -c "DROP DATABASE IF EXISTS \"$VERIFY_DB\" WITH (FORCE);" >/dev/null 2>&1 || true
  fi

  if [[ "$SSH_OPEN" == true ]]; then
    ssh -O exit -o ControlPath="$SSH_SOCKET" "$VPS_USER@$VPS_HOST" >/dev/null 2>&1 || true
  fi

  rm -f "$SSH_SOCKET"
  rmdir "$TEMP_DIR" >/dev/null 2>&1 || true
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"

echo "Production backup"
echo "Source: $VPS_USER@$VPS_HOST / container $VPS_CONTAINER / database $VPS_DB_NAME"
echo "Destination: $BACKUP_PATH"
echo "No database will be modified."
echo ""
read -r -p "Type 'backup-orgalife-prod' to continue: " confirm
[[ "$confirm" == "backup-orgalife-prod" ]] || { echo "Aborted."; exit 1; }

ssh -o ControlMaster=auto -o ControlPath="$SSH_SOCKET" -o ControlPersist=60 \
  -N -f "$VPS_USER@$VPS_HOST"
SSH_OPEN=true

echo "1/4 Dumping production..."
ssh -o ControlMaster=auto -o ControlPath="$SSH_SOCKET" -o ControlPersist=60 \
  "$VPS_USER@$VPS_HOST" \
  "docker exec $VPS_CONTAINER pg_dump -U $VPS_DB_USER --format=custom --no-owner --no-acl $VPS_DB_NAME" \
  > "$BACKUP_PATH"
chmod 600 "$BACKUP_PATH"
[[ -s "$BACKUP_PATH" ]] || { echo "Backup is empty; keeping it for inspection."; exit 1; }

echo "2/4 Checking archive structure..."
docker exec -i "$LOCAL_CONTAINER" pg_restore --list < "$BACKUP_PATH" >/dev/null

echo "3/4 Restoring into isolated scratch database..."
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" postgres \
  -c "CREATE DATABASE \"$VERIFY_DB\";" >/dev/null
VERIFY_DB_CREATED=true
docker exec -i "$LOCAL_CONTAINER" pg_restore -U "$LOCAL_DB_USER" \
  --no-owner --no-acl --dbname "$VERIFY_DB" < "$BACKUP_PATH"

TABLE_COUNT="$(docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" -d "$VERIFY_DB" -At \
  -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';")"
[[ "$TABLE_COUNT" =~ ^[1-9][0-9]*$ ]] || { echo "Scratch restore contains no public tables."; exit 1; }

docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" postgres \
  -c "DROP DATABASE \"$VERIFY_DB\" WITH (FORCE);" >/dev/null
VERIFY_DB_CREATED=false

echo "4/4 Writing checksum and manifest..."
shasum -a 256 "$BACKUP_PATH" > "$CHECKSUM_PATH"
chmod 600 "$CHECKSUM_PATH"
{
  echo "source=$VPS_USER@$VPS_HOST/$VPS_CONTAINER/$VPS_DB_NAME"
  echo "created_at_utc=$BACKUP_TIMESTAMP"
  echo "archive=$BACKUP_PATH"
  echo "public_table_count=$TABLE_COUNT"
  echo "scratch_restore=passed"
} > "$MANIFEST_PATH"
chmod 600 "$MANIFEST_PATH"

echo ""
echo "Backup verified successfully."
echo "Archive: $BACKUP_PATH"
echo "Checksum: $CHECKSUM_PATH"
echo "Manifest: $MANIFEST_PATH"
