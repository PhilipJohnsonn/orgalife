/*
  Warnings:

  - You are about to drop the column `periodId` on the `CardStatement` table. All the data in the column will be lost.
  - You are about to drop the `FinancialPeriod` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FixedExpense` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Income` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PeriodBalance` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'DEBIT', 'CREDIT', 'TRANSFER');

-- DropForeignKey
ALTER TABLE "CardStatement" DROP CONSTRAINT "CardStatement_periodId_fkey";

-- DropForeignKey
ALTER TABLE "PeriodBalance" DROP CONSTRAINT "PeriodBalance_accountId_fkey";

-- DropForeignKey
ALTER TABLE "PeriodBalance" DROP CONSTRAINT "PeriodBalance_periodId_fkey";

-- AlterTable
ALTER TABLE "CardStatement" DROP COLUMN "periodId";

-- DropTable
DROP TABLE "FinancialPeriod";

-- DropTable
DROP TABLE "FixedExpense";

-- DropTable
DROP TABLE "Income";

-- DropTable
DROP TABLE "PeriodBalance";

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "amountUSD" DOUBLE PRECISION,
    "date" TIMESTAMP(3) NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "accountId" TEXT,
    "categoryId" TEXT,
    "cardExpenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_cardExpenseId_key" ON "Transaction"("cardExpenseId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_cardExpenseId_fkey" FOREIGN KEY ("cardExpenseId") REFERENCES "CardExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
