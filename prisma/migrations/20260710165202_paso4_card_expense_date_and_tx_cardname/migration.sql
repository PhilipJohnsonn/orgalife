-- AlterTable
ALTER TABLE "CardExpense" ADD COLUMN     "purchaseDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "cardName" TEXT;
