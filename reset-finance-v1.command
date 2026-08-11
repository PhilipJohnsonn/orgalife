#!/bin/bash
set -Eeuo pipefail

cd "$(dirname "$0")"

VPS_USER="deploy"
VPS_HOST="129.226.84.76"
VPS_DB_USER="admin"
VPS_DB_NAME="orgalife"
VPS_CONTAINER="postgres"

usage() {
  echo "Usage: $0 --check | --backup-manifest PATH" >&2
  exit 2
}

if [[ "${1:-}" == "--check" && $# -eq 1 ]]; then
  echo "Read-only finance reset check"
  ssh "$VPS_USER@$VPS_HOST" \
    "docker exec $VPS_CONTAINER psql -U $VPS_DB_USER -d $VPS_DB_NAME -Atc \"SELECT 'boards', count(*) FROM \\\"Board\\\"; SELECT 'sessions', count(*) FROM \\\"Session\\\"; SELECT 'legacy_transactions', count(*) FROM \\\"Transaction\\\"; SELECT 'journal_entries', count(*) FROM \\\"JournalEntry\\\";\""
  echo "No data changed. Boards, tasks and sessions are outside the reset allowlist."
  exit 0
fi

[[ "${1:-}" == "--backup-manifest" && $# -eq 2 ]] || usage
MANIFEST_PATH="$2"
[[ -f "$MANIFEST_PATH" ]] || { echo "Backup manifest not found: $MANIFEST_PATH" >&2; exit 1; }
grep -qx 'scratch_restore=passed' "$MANIFEST_PATH" || { echo "Backup manifest is not restore-verified." >&2; exit 1; }
BACKUP_PATH="$(sed -n 's/^archive=//p' "$MANIFEST_PATH")"
[[ -n "$BACKUP_PATH" && -f "$BACKUP_PATH" && -f "$BACKUP_PATH.sha256" ]] || {
  echo "Verified archive or checksum is missing." >&2
  exit 1
}
shasum -a 256 -c "$BACKUP_PATH.sha256"

echo "WARNING: this permanently removes finance data from production."
echo "Preserved: boards, columns, tasks, subtasks, tags and sessions."
echo "Verified backup: $BACKUP_PATH"
read -r -p "Type 'reset-orgalife-finance-v1' to continue: " confirm
[[ "$confirm" == "reset-orgalife-finance-v1" ]] || { echo "Aborted."; exit 1; }

ssh "$VPS_USER@$VPS_HOST" \
  "docker exec -i $VPS_CONTAINER psql -U $VPS_DB_USER -d $VPS_DB_NAME -v ON_ERROR_STOP=1" <<'SQL'
BEGIN;
TRUNCATE TABLE
  "RecurringCommitmentObservation",
  "RecurringCommitment",
  "CategoryRule",
  "ObligationSettlement",
  "Obligation",
  "CardPaymentAllocation",
  "CardReconciliation",
  "TaxExclusion",
  "Posting",
  "JournalEntryAudit",
  "JournalEntryExchangeRateReference",
  "JournalEntry",
  "ExchangeRateSnapshot",
  "LedgerCardStatementLine",
  "LedgerCardStatementTotal",
  "LedgerCardStatement",
  "LedgerAccount",
  "AccountGroup",
  "FinanceConfiguration",
  "Transaction",
  "CardExpense",
  "CardStatement",
  "Debt",
  "FinancialAccount",
  "Category"
RESTART IDENTITY;
COMMIT;
SQL

echo "Finance data reset completed. Non-financial data was not included."
