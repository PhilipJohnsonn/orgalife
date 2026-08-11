-- CreateEnum
CREATE TYPE "AccountRegion" AS ENUM ('ARGENTINA', 'AUSTRALIA', 'GLOBAL');

-- CreateEnum
CREATE TYPE "AccountGroupType" AS ENUM ('BANK', 'WALLET', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "LedgerAccountKind" AS ENUM ('ASSET', 'LIABILITY', 'RECEIVABLE', 'PAYABLE', 'INCOME', 'EXPENSE', 'EQUITY', 'CLEARING');

-- CreateEnum
CREATE TYPE "LedgerAccountSubtype" AS ENUM ('BANK', 'WALLET', 'CARD', 'OPENING', 'FX', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountTrackingMode" AS ENUM ('TRANSACTIONAL', 'DECLARED');

-- CreateEnum
CREATE TYPE "JournalOperationType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER', 'FX', 'CARD_PURCHASE', 'CARD_PAYMENT', 'LOAN', 'SETTLEMENT', 'OPENING_BALANCE', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('POSTED', 'PROVISIONAL', 'SUPERSEDED', 'DISMISSED', 'REVERSED');

-- CreateEnum
CREATE TYPE "JournalEntrySource" AS ENUM ('MANUAL', 'CARD_STATEMENT', 'SYSTEM', 'REVOLUT_API');

-- CreateEnum
CREATE TYPE "PostingSide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "JournalAuditField" AS ENUM ('DESCRIPTION', 'CATEGORY');

-- CreateTable
CREATE TABLE "AccountGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" "AccountRegion" NOT NULL,
    "type" "AccountGroupType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "accountGroupId" TEXT,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "kind" "LedgerAccountKind" NOT NULL,
    "subtype" "LedgerAccountSubtype" NOT NULL,
    "trackingMode" "AccountTrackingMode" NOT NULL DEFAULT 'TRANSACTIONAL',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LedgerAccount_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "operationType" "JournalOperationType" NOT NULL,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'POSTED',
    "source" "JournalEntrySource" NOT NULL,
    "occurredOn" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "reversalOfId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JournalEntry_not_self_reversal_check" CHECK ("reversalOfId" IS NULL OR "reversalOfId" <> "id")
);

-- CreateTable
CREATE TABLE "Posting" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "ledgerAccountId" TEXT NOT NULL,
    "side" "PostingSide" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "categoryId" TEXT,
    "statementLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Posting_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Posting_amount_positive_check" CHECK ("amount" > 0)
);

-- CreateTable
CREATE TABLE "JournalEntryAudit" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "field" "JournalAuditField" NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntryAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_accountGroupId_currency_key" ON "LedgerAccount"("accountGroupId", "currency");

-- CreateIndex
CREATE INDEX "LedgerAccount_kind_currency_idx" ON "LedgerAccount"("kind", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversalOfId_key" ON "JournalEntry"("reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_source_idempotencyKey_key" ON "JournalEntry"("source", "idempotencyKey");

-- CreateIndex
CREATE INDEX "JournalEntry_occurredOn_status_idx" ON "JournalEntry"("occurredOn", "status");

-- CreateIndex
CREATE INDEX "Posting_journalEntryId_idx" ON "Posting"("journalEntryId");

-- CreateIndex
CREATE INDEX "Posting_ledgerAccountId_idx" ON "Posting"("ledgerAccountId");

-- CreateIndex
CREATE INDEX "Posting_categoryId_idx" ON "Posting"("categoryId");

-- CreateIndex
CREATE INDEX "Posting_statementLineId_idx" ON "Posting"("statementLineId");

-- CreateIndex
CREATE INDEX "JournalEntryAudit_journalEntryId_createdAt_idx" ON "JournalEntryAudit"("journalEntryId", "createdAt");

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_accountGroupId_fkey" FOREIGN KEY ("accountGroupId") REFERENCES "AccountGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posting" ADD CONSTRAINT "Posting_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posting" ADD CONSTRAINT "Posting_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posting" ADD CONSTRAINT "Posting_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryAudit" ADD CONSTRAINT "JournalEntryAudit_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
