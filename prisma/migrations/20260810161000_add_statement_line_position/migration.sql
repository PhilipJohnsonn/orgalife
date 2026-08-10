ALTER TABLE "LedgerCardStatementLine" ADD COLUMN "position" INTEGER NOT NULL;

CREATE UNIQUE INDEX "LedgerCardStatementLine_statementId_position_key"
ON "LedgerCardStatementLine"("statementId", "position");

ALTER TABLE "LedgerCardStatementLine" ADD CONSTRAINT "LedgerCardStatementLine_position_nonnegative_check"
CHECK ("position" >= 0);
