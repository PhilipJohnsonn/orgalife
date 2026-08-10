ALTER TABLE "LedgerCardStatementLine" ADD COLUMN "reconciledJournalEntryId" TEXT;

CREATE TABLE "CardReconciliation" (
    "id" TEXT NOT NULL,
    "provisionalEntryId" TEXT NOT NULL,
    "statementLineId" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CardPaymentAllocation" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardPaymentAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CardPaymentAllocation_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "CardPaymentAllocation_amount_positive_check" CHECK ("amount" > 0)
);

CREATE INDEX "LedgerCardStatementLine_reconciledJournalEntryId_idx"
ON "LedgerCardStatementLine"("reconciledJournalEntryId");
CREATE INDEX "CardReconciliation_provisionalEntryId_releasedAt_idx"
ON "CardReconciliation"("provisionalEntryId", "releasedAt");
CREATE INDEX "CardReconciliation_statementLineId_releasedAt_idx"
ON "CardReconciliation"("statementLineId", "releasedAt");
CREATE UNIQUE INDEX "CardReconciliation_active_statement_line_key"
ON "CardReconciliation"("statementLineId") WHERE "releasedAt" IS NULL;
CREATE INDEX "CardPaymentAllocation_statementId_currency_releasedAt_idx"
ON "CardPaymentAllocation"("statementId", "currency", "releasedAt");
CREATE INDEX "CardPaymentAllocation_journalEntryId_currency_releasedAt_idx"
ON "CardPaymentAllocation"("journalEntryId", "currency", "releasedAt");
CREATE UNIQUE INDEX "CardPaymentAllocation_active_pair_key"
ON "CardPaymentAllocation"("statementId", "journalEntryId") WHERE "releasedAt" IS NULL;

ALTER TABLE "LedgerCardStatementLine" ADD CONSTRAINT "LedgerCardStatementLine_reconciledJournalEntryId_fkey"
FOREIGN KEY ("reconciledJournalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardReconciliation" ADD CONSTRAINT "CardReconciliation_provisionalEntryId_fkey"
FOREIGN KEY ("provisionalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardReconciliation" ADD CONSTRAINT "CardReconciliation_statementLineId_fkey"
FOREIGN KEY ("statementLineId") REFERENCES "LedgerCardStatementLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardPaymentAllocation" ADD CONSTRAINT "CardPaymentAllocation_statementId_fkey"
FOREIGN KEY ("statementId") REFERENCES "LedgerCardStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardPaymentAllocation" ADD CONSTRAINT "CardPaymentAllocation_journalEntryId_fkey"
FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
