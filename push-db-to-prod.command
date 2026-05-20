#!/bin/bash
set -e
cd "$(dirname "$0")"

VPS_USER="deploy"
VPS_HOST="129.226.84.76"
VPS_DB_USER="admin"
VPS_DB_NAME="orgalife"
VPS_CONTAINER="postgres"

LOCAL_DB_USER="orgalife"
LOCAL_DB_NAME="orgalife"
LOCAL_CONTAINER="orgalife-db"

DUMP_FILE="/tmp/orgalife-local-dump.sql"
SSH_SOCKET="/tmp/ssh-orgalife-$$"
SSH="ssh -o ControlMaster=auto -o ControlPath=$SSH_SOCKET -o ControlPersist=60"

echo ""
echo "⚠️  This will OVERWRITE the production database with your local data."
read -p "    Type 'yes' to continue: " confirm
[[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 1; }

echo ""
echo "Connecting to VPS (enter password once)..."
$SSH -N -f "$VPS_USER@$VPS_HOST"

echo ""
echo "1/4  Dumping local database..."
docker exec "$LOCAL_CONTAINER" pg_dump -U "$LOCAL_DB_USER" --no-owner --no-acl "$LOCAL_DB_NAME" > "$DUMP_FILE"
echo "     $(du -h $DUMP_FILE | cut -f1) written."

echo "2/4  Stopping app on VPS..."
$SSH "$VPS_USER@$VPS_HOST" "cd ~/orgalife && docker compose stop app"

echo "3/4  Restoring database on VPS..."
$SSH "$VPS_USER@$VPS_HOST" "docker exec $VPS_CONTAINER psql -U $VPS_DB_USER postgres -c 'DROP DATABASE IF EXISTS \"$VPS_DB_NAME\" WITH (FORCE);'"
$SSH "$VPS_USER@$VPS_HOST" "docker exec $VPS_CONTAINER psql -U $VPS_DB_USER postgres -c 'CREATE DATABASE \"$VPS_DB_NAME\";'"
$SSH "$VPS_USER@$VPS_HOST" "docker exec -i $VPS_CONTAINER psql -U $VPS_DB_USER $VPS_DB_NAME" < "$DUMP_FILE"

echo "4/4  Starting app on VPS..."
$SSH "$VPS_USER@$VPS_HOST" "cd ~/orgalife && docker compose start app"

rm "$DUMP_FILE"
ssh -O exit -o ControlPath=$SSH_SOCKET "$VPS_USER@$VPS_HOST" 2>/dev/null || true

echo ""
echo "✅  Done. Production is now a copy of your local DB."

echo ""
read -p "Press Enter to close..."
