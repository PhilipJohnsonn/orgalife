-- AlterEnum
BEGIN;
CREATE TYPE "JournalEntrySource_new" AS ENUM ('MANUAL', 'SYSTEM', 'REVOLUT_API');
ALTER TABLE "JournalEntry" ALTER COLUMN "source" TYPE "JournalEntrySource_new" USING ("source"::text::"JournalEntrySource_new");
ALTER TYPE "JournalEntrySource" RENAME TO "JournalEntrySource_old";
ALTER TYPE "JournalEntrySource_new" RENAME TO "JournalEntrySource";
DROP TYPE "public"."JournalEntrySource_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "JournalEntryStatus_new" AS ENUM ('POSTED', 'REVERSED');
ALTER TABLE "public"."JournalEntry" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "JournalEntry" ALTER COLUMN "status" TYPE "JournalEntryStatus_new" USING ("status"::text::"JournalEntryStatus_new");
ALTER TYPE "JournalEntryStatus" RENAME TO "JournalEntryStatus_old";
ALTER TYPE "JournalEntryStatus_new" RENAME TO "JournalEntryStatus";
DROP TYPE "public"."JournalEntryStatus_old";
ALTER TABLE "JournalEntry" ALTER COLUMN "status" SET DEFAULT 'POSTED';
COMMIT;

-- DropForeignKey
ALTER TABLE "CardExpense" DROP CONSTRAINT "CardExpense_statementId_fkey";

-- DropForeignKey
ALTER TABLE "CardPaymentAllocation" DROP CONSTRAINT "CardPaymentAllocation_journalEntryId_fkey";

-- DropForeignKey
ALTER TABLE "CardPaymentAllocation" DROP CONSTRAINT "CardPaymentAllocation_statementId_fkey";

-- DropForeignKey
ALTER TABLE "CardReconciliation" DROP CONSTRAINT "CardReconciliation_provisionalEntryId_fkey";

-- DropForeignKey
ALTER TABLE "CardReconciliation" DROP CONSTRAINT "CardReconciliation_statementLineId_fkey";

-- DropForeignKey
ALTER TABLE "LedgerCardStatement" DROP CONSTRAINT "LedgerCardStatement_cardGroupId_fkey";

-- DropForeignKey
ALTER TABLE "LedgerCardStatementLine" DROP CONSTRAINT "LedgerCardStatementLine_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "LedgerCardStatementLine" DROP CONSTRAINT "LedgerCardStatementLine_proposedTaxExclusionId_fkey";

-- DropForeignKey
ALTER TABLE "LedgerCardStatementLine" DROP CONSTRAINT "LedgerCardStatementLine_reconciledJournalEntryId_fkey";

-- DropForeignKey
ALTER TABLE "LedgerCardStatementLine" DROP CONSTRAINT "LedgerCardStatementLine_statementId_fkey";

-- DropForeignKey
ALTER TABLE "LedgerCardStatementTotal" DROP CONSTRAINT "LedgerCardStatementTotal_statementId_fkey";

-- DropForeignKey
ALTER TABLE "Posting" DROP CONSTRAINT "Posting_statementLineId_fkey";

-- DropForeignKey
ALTER TABLE "RecurringCommitmentObservation" DROP CONSTRAINT "RecurringCommitmentObservation_commitmentId_fkey";

-- DropForeignKey
ALTER TABLE "RecurringCommitmentObservation" DROP CONSTRAINT "RecurringCommitmentObservation_statementLineId_fkey";

-- DropForeignKey
ALTER TABLE "TaxExclusion" DROP CONSTRAINT "TaxExclusion_cardGroupId_fkey";

-- DropForeignKey
ALTER TABLE "TaxExclusion" DROP CONSTRAINT "TaxExclusion_resolutionLineId_fkey";

-- DropForeignKey
ALTER TABLE "TaxExclusion" DROP CONSTRAINT "TaxExclusion_sourceLineId_fkey";

-- DropForeignKey
ALTER TABLE "TaxExclusion" DROP CONSTRAINT "TaxExclusion_sourceStatementId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_cardExpenseId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_categoryId_fkey";

-- DropIndex
DROP INDEX "Posting_statementLineId_idx";

-- AlterTable
ALTER TABLE "Posting" DROP COLUMN "statementLineId";

-- DropTable
DROP TABLE "CardExpense";

-- DropTable
DROP TABLE "CardPaymentAllocation";

-- DropTable
DROP TABLE "CardReconciliation";

-- DropTable
DROP TABLE "CardStatement";

-- DropTable
DROP TABLE "Debt";

-- DropTable
DROP TABLE "FinancialAccount";

-- DropTable
DROP TABLE "LedgerCardStatement";

-- DropTable
DROP TABLE "LedgerCardStatementLine";

-- DropTable
DROP TABLE "LedgerCardStatementTotal";

-- DropTable
DROP TABLE "RecurringCommitmentObservation";

-- DropTable
DROP TABLE "TaxExclusion";

-- DropTable
DROP TABLE "Transaction";

-- DropEnum
DROP TYPE "CardPaymentPolicy";

-- DropEnum
DROP TYPE "CardStatementLineClassification";

-- DropEnum
DROP TYPE "CardStatementPaymentTreatment";

-- DropEnum
DROP TYPE "LedgerCardStatementStatus";

-- DropEnum
DROP TYPE "PaymentMethod";

-- DropEnum
DROP TYPE "TaxExclusionResolution";

-- DropEnum
DROP TYPE "TaxExclusionStatus";

-- DropEnum
DROP TYPE "TransactionType";

