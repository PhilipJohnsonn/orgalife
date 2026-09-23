-- CreateTable
CREATE TABLE "WalletCardAlias" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "aliasNormalized" TEXT NOT NULL,
    "ledgerAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletCardAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletCardAlias_aliasNormalized_key" ON "WalletCardAlias"("aliasNormalized");

-- CreateIndex
CREATE INDEX "WalletCardAlias_ledgerAccountId_idx" ON "WalletCardAlias"("ledgerAccountId");

-- AddForeignKey
ALTER TABLE "WalletCardAlias" ADD CONSTRAINT "WalletCardAlias_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ExchangeRateSnapshot_baseCurrency_quoteCurrency_appliedOn_obser" RENAME TO "ExchangeRateSnapshot_baseCurrency_quoteCurrency_appliedOn_o_idx";

-- RenameIndex
ALTER INDEX "ExchangeRateSnapshot_baseCurrency_quoteCurrency_provider_observ" RENAME TO "ExchangeRateSnapshot_baseCurrency_quoteCurrency_provider_ob_key";
