/*
  Warnings:

  - You are about to drop the column `currency` on the `FinancialAccount` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "FinancialAccount" DROP COLUMN "currency",
ADD COLUMN     "currencies" TEXT[];
