-- CreateTable
CREATE TABLE "ExchangeRateSnapshot" (
    "id" TEXT NOT NULL,
    "baseCurrency" CHAR(3) NOT NULL,
    "quoteCurrency" CHAR(3) NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "provider" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "appliedOn" DATE NOT NULL,
    "isManualOverride" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRateSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ExchangeRateSnapshot_base_currency_check" CHECK ("baseCurrency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "ExchangeRateSnapshot_quote_currency_check" CHECK ("quoteCurrency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "ExchangeRateSnapshot_distinct_currency_check" CHECK ("baseCurrency" <> "quoteCurrency"),
    CONSTRAINT "ExchangeRateSnapshot_rate_positive_check" CHECK ("rate" > 0)
);

-- CreateTable
CREATE TABLE "JournalEntryExchangeRateReference" (
    "journalEntryId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,

    CONSTRAINT "JournalEntryExchangeRateReference_pkey" PRIMARY KEY ("journalEntryId", "snapshotId")
);

-- CreateTable
CREATE TABLE "FinanceConfiguration" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "baseCurrency" CHAR(3) NOT NULL DEFAULT 'USD',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceConfiguration_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FinanceConfiguration_base_currency_check" CHECK ("baseCurrency" ~ '^[A-Z]{3}$')
);

-- CreateIndex
CREATE INDEX "ExchangeRateSnapshot_baseCurrency_quoteCurrency_appliedOn_observedAt_idx"
ON "ExchangeRateSnapshot"("baseCurrency", "quoteCurrency", "appliedOn", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRateSnapshot_baseCurrency_quoteCurrency_provider_observedAt_isManualOverride_key"
ON "ExchangeRateSnapshot"("baseCurrency", "quoteCurrency", "provider", "observedAt", "isManualOverride");

-- CreateIndex
CREATE INDEX "JournalEntryExchangeRateReference_snapshotId_idx"
ON "JournalEntryExchangeRateReference"("snapshotId");

-- AddForeignKey
ALTER TABLE "JournalEntryExchangeRateReference" ADD CONSTRAINT "JournalEntryExchangeRateReference_journalEntryId_fkey"
FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryExchangeRateReference" ADD CONSTRAINT "JournalEntryExchangeRateReference_snapshotId_fkey"
FOREIGN KEY ("snapshotId") REFERENCES "ExchangeRateSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
