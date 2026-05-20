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

DUMP_FILE="/tmp/orgalife-vps-dump.sql"
SSH_SOCKET="/tmp/ssh-orgalife-$$"
SSH="ssh -o ControlMaster=auto -o ControlPath=$SSH_SOCKET -o ControlPersist=60"

echo ""
echo "⚠️  This will OVERWRITE your local database with production data."
read -p "    Type 'yes' to continue: " confirm
[[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 1; }

echo ""
echo "Connecting to VPS (enter password once)..."
$SSH -N -f "$VPS_USER@$VPS_HOST"

echo ""
echo "1/3  Dumping production database from VPS..."
$SSH "$VPS_USER@$VPS_HOST" "docker exec $VPS_CONTAINER pg_dump -U $VPS_DB_USER --no-owner --no-acl $VPS_DB_NAME" > "$DUMP_FILE"
echo "     $(du -h $DUMP_FILE | cut -f1) written."

echo "2/3  Restoring database locally..."
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" postgres -c "DROP DATABASE IF EXISTS \"$LOCAL_DB_NAME\" WITH (FORCE);"
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" postgres -c "CREATE DATABASE \"$LOCAL_DB_NAME\";"
docker exec -i "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" "$LOCAL_DB_NAME" < "$DUMP_FILE"

echo "3/3  Cleanup..."
rm "$DUMP_FILE"
ssh -O exit -o ControlPath=$SSH_SOCKET "$VPS_USER@$VPS_HOST" 2>/dev/null || true

echo ""
echo "✅  Done. Local DB is now a copy of production."

echo ""
read -p "Press Enter to close..."
