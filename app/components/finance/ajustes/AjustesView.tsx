"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CardStatement, LedgerAccount } from "@/app/components/finance/cierre/shared";
import { AccountsSection } from "./AccountsSection";
import { CategoriesSection } from "./CategoriesSection";
import { CommitmentsSection } from "./CommitmentsSection";
import { CurrenciesSection } from "./CurrenciesSection";
import { PeopleSection } from "./PeopleSection";
import { WalletAliasesSection } from "./WalletAliasesSection";
import { derivePurchaseLines } from "./purchaseLines";

export function AjustesView() {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [statements, setStatements] = useState<CardStatement[]>([]);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadAccounts = useCallback(async () => {
    const response = await fetch("/api/finance/v1/accounts");
    if (!response.ok) throw new Error("No se pudieron cargar las cuentas");
    setAccounts(await response.json());
  }, []);

  const loadStatements = useCallback(async () => {
    const response = await fetch("/api/finance/v1/card-statements");
    if (!response.ok) throw new Error("No se pudieron cargar los resúmenes");
    setStatements(await response.json());
  }, []);

  const loadCurrencies = useCallback(async () => {
    const response = await fetch("/api/finance/v1/currencies");
    if (!response.ok) throw new Error("No se pudieron cargar las monedas");
    setCurrencies(await response.json());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([loadAccounts(), loadStatements(), loadCurrencies()])
      .catch(() => setError("No se pudieron cargar los datos de ajustes."))
      .finally(() => setLoading(false));
  }, [loadAccounts, loadStatements, loadCurrencies]);

  const purchaseLines = useMemo(() => derivePurchaseLines(statements), [statements]);

  return (
    <div className="min-w-0 space-y-4">
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <AccountsSection accounts={accounts} currencies={currencies} loading={loading} onCreated={loadAccounts} />
      <CurrenciesSection currencies={currencies} loading={loading} onChanged={loadCurrencies} />
      <PeopleSection />
      <WalletAliasesSection />
      <CategoriesSection purchaseLines={purchaseLines} onCategorized={loadStatements} />
      <CommitmentsSection accounts={accounts} purchaseLines={purchaseLines} />
    </div>
  );
}
