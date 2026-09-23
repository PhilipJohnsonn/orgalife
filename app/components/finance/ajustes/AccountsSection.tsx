"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LedgerAccount, Region } from "@/app/components/finance/cierre/shared";
import { AccountRow } from "./accounts/AccountRow";
import { CreateAccountDialog, EntityPrefill } from "./accounts/CreateAccountDialog";

const groupTypeLabels: Record<string, string> = {
  BANK: "Banco",
  WALLET: "Billetera",
  CARD: "Tarjeta",
  OTHER: "Otro",
};

type EntityGroup = {
  key: string;
  name: string;
  type: string | null;
  region: Region | null;
  accounts: LedgerAccount[];
};

function groupByEntity(accounts: LedgerAccount[]): EntityGroup[] {
  const groups = new Map<string, EntityGroup>();
  for (const account of accounts) {
    if (!account.isActive) continue;
    const key = account.group?.id ?? "none";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: account.group?.name ?? "Sin entidad",
        type: account.group?.type ?? null,
        region: account.group?.region ?? null,
        accounts: [],
      });
    }
    groups.get(key)!.accounts.push(account);
  }
  return Array.from(groups.values());
}

export function AccountsSection({
  accounts,
  loading,
  onCreated,
}: {
  accounts: LedgerAccount[];
  loading: boolean;
  onCreated: () => Promise<void>;
}) {
  const [createTarget, setCreateTarget] = useState<EntityPrefill | "new" | null>(null);
  const [notice, setNotice] = useState("");

  const groups = useMemo(() => groupByEntity(accounts), [accounts]);
  const archivedCount = useMemo(() => accounts.filter((account) => !account.isActive).length, [accounts]);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Cuentas</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {notice && (
          <p role="status" className="rounded-md bg-muted p-3 text-sm">
            {notice}
          </p>
        )}
        {loading && <p className="text-sm text-muted-foreground">Cargando cuentas…</p>}
        {!loading && groups.length === 0 && <p className="text-sm text-muted-foreground">Todavía no creaste ninguna cuenta.</p>}

        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.key} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{group.name}</p>
                  {group.type && <p className="text-xs text-muted-foreground">{groupTypeLabels[group.type] ?? group.type}</p>}
                </div>
                {group.key !== "none" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11"
                    onClick={() => setCreateTarget({ groupName: group.name, groupType: group.type!, region: group.region! })}
                  >
                    Agregar moneda
                  </Button>
                )}
              </div>
              <div className="mt-2 divide-y">
                {group.accounts.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    onChanged={onCreated}
                    onDeleted={(result) => setNotice(result === "DELETED" ? "Cuenta eliminada" : "Cuenta archivada")}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {archivedCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {archivedCount} cuenta{archivedCount === 1 ? "" : "s"} archivada{archivedCount === 1 ? "" : "s"}
          </p>
        )}

        {!loading && (
          <Button variant="outline" className="min-h-11" onClick={() => setCreateTarget("new")}>
            Agregar cuenta
          </Button>
        )}

        {createTarget !== null && (
          <CreateAccountDialog
            prefill={createTarget === "new" ? null : createTarget}
            onClose={() => setCreateTarget(null)}
            onCreated={onCreated}
          />
        )}
      </CardContent>
    </Card>
  );
}
