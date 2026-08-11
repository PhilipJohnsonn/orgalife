-- CreateEnum
CREATE TYPE "LedgerCardStatementStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'REVERSED');
CREATE TYPE "CardPaymentPolicy" AS ENUM ('BY_BILLED_CURRENCY');
CREATE TYPE "CardStatementLineClassification" AS ENUM (
    'PURCHASE', 'ELIGIBLE_USD_TAX', 'PAYABLE_TAX', 'INTEREST', 'FEE',
    'PAYMENT_OR_CREDIT', 'PREVIOUS_BALANCE', 'INFORMATIONAL', 'UNKNOWN'
);
CREATE TYPE "CardStatementPaymentTreatment" AS ENUM (
    'PAYABLE', 'EXCLUDED_FROM_PAYMENT', 'INFORMATIONAL', 'NEEDS_REVIEW'
);
CREATE TYPE "TaxExclusionStatus" AS ENUM (
    'PENDING_CONFIRMATION', 'CONFIRMED_NOT_CHARGED', 'NEEDS_REVIEW',
    'CHARGED', 'CANCELLED'
);
CREATE TYPE "TaxExclusionResolution" AS ENUM (
    'CREDIT_LINE', 'OMITTED_FROM_BALANCE', 'CHARGED', 'CANCELLED'
);

-- CreateTable
CREATE TABLE "LedgerCardStatement" (
    "id" TEXT NOT NULL,
    "cardGroupId" TEXT NOT NULL,
    "cycleFrom" DATE,
    "cycleTo" DATE,
    "closingOn" DATE NOT NULL,
    "dueOn" DATE NOT NULL,
    "documentHash" CHAR(64) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "confirmationKey" CHAR(64) NOT NULL,
    "parserVersion" INTEGER NOT NULL,
    "paymentPolicy" "CardPaymentPolicy" NOT NULL DEFAULT 'BY_BILLED_CURRENCY',
    "status" "LedgerCardStatementStatus" NOT NULL DEFAULT 'DRAFT',
    "ignoredPages" INTEGER[] NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerCardStatement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LedgerCardStatement_document_hash_check" CHECK ("documentHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "LedgerCardStatement_confirmation_key_check" CHECK ("confirmationKey" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "LedgerCardStatement_revision_positive_check" CHECK ("revision" > 0),
    CONSTRAINT "LedgerCardStatement_parser_version_positive_check" CHECK ("parserVersion" > 0),
    CONSTRAINT "LedgerCardStatement_state_timestamps_check" CHECK (
        ("status" = 'DRAFT' AND "confirmedAt" IS NULL AND "reversedAt" IS NULL) OR
        ("status" = 'CONFIRMED' AND "confirmedAt" IS NOT NULL AND "reversedAt" IS NULL) OR
        ("status" = 'REVERSED' AND "confirmedAt" IS NOT NULL AND "reversedAt" IS NOT NULL)
    )
);

CREATE TABLE "LedgerCardStatementTotal" (
    "statementId" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "previousBalance" DECIMAL(18,2) NOT NULL,
    "paymentsAndCredits" DECIMAL(18,2) NOT NULL,
    "newCharges" DECIMAL(18,2) NOT NULL,
    "reportedTotal" DECIMAL(18,2) NOT NULL,
    "eligibleExclusions" DECIMAL(18,2) NOT NULL,
    "payableTotal" DECIMAL(18,2) NOT NULL,
    "residual" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "LedgerCardStatementTotal_pkey" PRIMARY KEY ("statementId", "currency"),
    CONSTRAINT "LedgerCardStatementTotal_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "LedgerCardStatementLine" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "sourceLine" TEXT NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "purchaseOn" DATE,
    "billedOn" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "classification" "CardStatementLineClassification" NOT NULL,
    "paymentTreatment" "CardStatementPaymentTreatment" NOT NULL,
    "billedCurrency" CHAR(3) NOT NULL,
    "billedAmount" DECIMAL(18,2) NOT NULL,
    "originalCurrency" CHAR(3),
    "originalAmount" DECIMAL(18,2),
    "installmentInfo" TEXT,
    "categoryId" TEXT,
    "proposedTaxExclusionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerCardStatementLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LedgerCardStatementLine_fingerprint_check" CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "LedgerCardStatementLine_billed_currency_check" CHECK ("billedCurrency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "LedgerCardStatementLine_original_currency_check" CHECK ("originalCurrency" IS NULL OR "originalCurrency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "LedgerCardStatementLine_billed_amount_nonzero_check" CHECK ("billedAmount" <> 0),
    CONSTRAINT "LedgerCardStatementLine_original_amount_positive_check" CHECK ("originalAmount" IS NULL OR "originalAmount" > 0)
);

CREATE TABLE "TaxExclusion" (
    "id" TEXT NOT NULL,
    "cardGroupId" TEXT NOT NULL,
    "sourceStatementId" TEXT NOT NULL,
    "sourceLineId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "TaxExclusionStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "resolution" "TaxExclusionResolution",
    "resolutionLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxExclusion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TaxExclusion_amount_positive_check" CHECK ("amount" > 0),
    CONSTRAINT "TaxExclusion_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "TaxExclusion_resolution_state_check" CHECK (
        ("status" IN ('PENDING_CONFIRMATION', 'NEEDS_REVIEW') AND "resolution" IS NULL AND "resolutionLineId" IS NULL) OR
        ("status" IN ('CONFIRMED_NOT_CHARGED', 'CHARGED', 'CANCELLED') AND "resolution" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerCardStatement_confirmationKey_key"
ON "LedgerCardStatement"("confirmationKey");
CREATE UNIQUE INDEX "LedgerCardStatement_cardGroupId_documentHash_revision_key"
ON "LedgerCardStatement"("cardGroupId", "documentHash", "revision");
CREATE UNIQUE INDEX "LedgerCardStatement_confirmed_document_key"
ON "LedgerCardStatement"("cardGroupId", "documentHash")
WHERE "status" = 'CONFIRMED';
CREATE INDEX "LedgerCardStatement_cardGroupId_closingOn_status_idx"
ON "LedgerCardStatement"("cardGroupId", "closingOn", "status");
CREATE INDEX "LedgerCardStatement_status_updatedAt_idx"
ON "LedgerCardStatement"("status", "updatedAt");

CREATE UNIQUE INDEX "LedgerCardStatementLine_statementId_sourceLine_key"
ON "LedgerCardStatementLine"("statementId", "sourceLine");
CREATE UNIQUE INDEX "LedgerCardStatementLine_statementId_fingerprint_key"
ON "LedgerCardStatementLine"("statementId", "fingerprint");
CREATE INDEX "LedgerCardStatementLine_proposedTaxExclusionId_idx"
ON "LedgerCardStatementLine"("proposedTaxExclusionId");

CREATE UNIQUE INDEX "TaxExclusion_sourceLineId_key" ON "TaxExclusion"("sourceLineId");
CREATE UNIQUE INDEX "TaxExclusion_resolutionLineId_key" ON "TaxExclusion"("resolutionLineId");
CREATE INDEX "TaxExclusion_cardGroupId_currency_status_idx"
ON "TaxExclusion"("cardGroupId", "currency", "status");
CREATE INDEX "TaxExclusion_sourceStatementId_idx" ON "TaxExclusion"("sourceStatementId");

-- AddForeignKey
ALTER TABLE "LedgerCardStatement" ADD CONSTRAINT "LedgerCardStatement_cardGroupId_fkey"
FOREIGN KEY ("cardGroupId") REFERENCES "AccountGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerCardStatementTotal" ADD CONSTRAINT "LedgerCardStatementTotal_statementId_fkey"
FOREIGN KEY ("statementId") REFERENCES "LedgerCardStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerCardStatementLine" ADD CONSTRAINT "LedgerCardStatementLine_statementId_fkey"
FOREIGN KEY ("statementId") REFERENCES "LedgerCardStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerCardStatementLine" ADD CONSTRAINT "LedgerCardStatementLine_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerCardStatementLine" ADD CONSTRAINT "LedgerCardStatementLine_proposedTaxExclusionId_fkey"
FOREIGN KEY ("proposedTaxExclusionId") REFERENCES "TaxExclusion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaxExclusion" ADD CONSTRAINT "TaxExclusion_cardGroupId_fkey"
FOREIGN KEY ("cardGroupId") REFERENCES "AccountGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaxExclusion" ADD CONSTRAINT "TaxExclusion_sourceStatementId_fkey"
FOREIGN KEY ("sourceStatementId") REFERENCES "LedgerCardStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxExclusion" ADD CONSTRAINT "TaxExclusion_sourceLineId_fkey"
FOREIGN KEY ("sourceLineId") REFERENCES "LedgerCardStatementLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaxExclusion" ADD CONSTRAINT "TaxExclusion_resolutionLineId_fkey"
FOREIGN KEY ("resolutionLineId") REFERENCES "LedgerCardStatementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Posting" ADD CONSTRAINT "Posting_statementLineId_fkey"
FOREIGN KEY ("statementLineId") REFERENCES "LedgerCardStatementLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
