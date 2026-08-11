-- AlterEnum
ALTER TYPE "LedgerAccountSubtype" ADD VALUE 'ADJUSTMENT';

-- A technical account has one stable role per currency.
CREATE UNIQUE INDEX "LedgerAccount_system_role_currency_key"
ON "LedgerAccount"("kind", "subtype", "currency")
WHERE "isSystem" = true;
