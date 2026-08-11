CREATE TYPE "ObligationDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');
CREATE TYPE "ObligationOriginType" AS ENUM ('ACCOUNT_MOVEMENT', 'OPENING_BALANCE');
CREATE TYPE "CategoryRuleSource" AS ENUM ('USER_CONFIRMED');
CREATE TYPE "RecurringFrequency" AS ENUM ('ONCE', 'WEEKLY', 'MONTHLY');
CREATE TYPE "RecurringCommitmentStatus" AS ENUM ('ACTIVE', 'CANCELLED');

CREATE TABLE "Obligation" (
    "id" TEXT NOT NULL,
    "direction" "ObligationDirection" NOT NULL,
    "originType" "ObligationOriginType" NOT NULL,
    "counterparty" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "originalAmount" DECIMAL(18,2) NOT NULL,
    "dueOn" DATE,
    "originEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Obligation_originalAmount_positive_check" CHECK ("originalAmount" > 0)
);

CREATE TABLE "ObligationSettlement" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ObligationSettlement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ObligationSettlement_amount_positive_check" CHECK ("amount" > 0)
);

CREATE TABLE "CategoryRule" (
    "id" TEXT NOT NULL,
    "patternNormalized" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "source" "CategoryRuleSource" NOT NULL DEFAULT 'USER_CONFIRMED',
    "lastUsedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CategoryRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecurringCommitment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expectedAmount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "frequency" "RecurringFrequency" NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "categoryId" TEXT,
    "expectedAccountId" TEXT,
    "status" "RecurringCommitmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecurringCommitment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RecurringCommitment_expectedAmount_positive_check" CHECK ("expectedAmount" > 0),
    CONSTRAINT "RecurringCommitment_dates_check" CHECK ("endsOn" IS NULL OR "endsOn" >= "startsOn"),
    CONSTRAINT "RecurringCommitment_cancelledAt_check" CHECK (("status" = 'ACTIVE' AND "cancelledAt" IS NULL) OR ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL))
);

CREATE TABLE "RecurringCommitmentObservation" (
    "commitmentId" TEXT NOT NULL,
    "statementLineId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecurringCommitmentObservation_pkey" PRIMARY KEY ("commitmentId", "statementLineId")
);

CREATE UNIQUE INDEX "Obligation_originEntryId_key" ON "Obligation"("originEntryId");
CREATE INDEX "Obligation_direction_currency_idx" ON "Obligation"("direction", "currency");
CREATE INDEX "Obligation_dueOn_idx" ON "Obligation"("dueOn");
CREATE UNIQUE INDEX "ObligationSettlement_journalEntryId_key" ON "ObligationSettlement"("journalEntryId");
CREATE INDEX "ObligationSettlement_obligationId_createdAt_idx" ON "ObligationSettlement"("obligationId", "createdAt");
CREATE INDEX "CategoryRule_isActive_priority_idx" ON "CategoryRule"("isActive", "priority");
CREATE UNIQUE INDEX "CategoryRule_patternNormalized_categoryId_key" ON "CategoryRule"("patternNormalized", "categoryId");
CREATE INDEX "RecurringCommitment_status_startsOn_endsOn_idx" ON "RecurringCommitment"("status", "startsOn", "endsOn");
CREATE UNIQUE INDEX "RecurringCommitmentObservation_statementLineId_key" ON "RecurringCommitmentObservation"("statementLineId");

ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_originEntryId_fkey" FOREIGN KEY ("originEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ObligationSettlement" ADD CONSTRAINT "ObligationSettlement_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ObligationSettlement" ADD CONSTRAINT "ObligationSettlement_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CategoryRule" ADD CONSTRAINT "CategoryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringCommitment" ADD CONSTRAINT "RecurringCommitment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringCommitment" ADD CONSTRAINT "RecurringCommitment_expectedAccountId_fkey" FOREIGN KEY ("expectedAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringCommitmentObservation" ADD CONSTRAINT "RecurringCommitmentObservation_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "RecurringCommitment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringCommitmentObservation" ADD CONSTRAINT "RecurringCommitmentObservation_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "LedgerCardStatementLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
