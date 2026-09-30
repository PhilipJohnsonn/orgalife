-- CreateTable
CREATE TABLE "EnabledCurrency" (
    "code" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnabledCurrency_pkey" PRIMARY KEY ("code")
);

-- Seed: default currencies plus every currency already used by a user account.
INSERT INTO "EnabledCurrency" ("code")
SELECT "code" FROM (VALUES ('AUD'), ('USD'), ('ARS')) AS defaults("code")
UNION
SELECT DISTINCT TRIM("currency") FROM "LedgerAccount" WHERE "isSystem" = false
ON CONFLICT DO NOTHING;
