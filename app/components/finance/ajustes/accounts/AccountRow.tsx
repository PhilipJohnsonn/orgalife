"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LedgerAccount } from "@/app/components/finance/cierre/shared";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import { RenameAccountDialog } from "./RenameAccountDialog";
import { UpdateBalanceDialog } from "./UpdateBalanceDialog";

type ActiveDialog = "rename" | "balance" | "delete" | null;

export function AccountRow({
  account,
  onChanged,
  onDeleted,
}: {
  account: LedgerAccount;
  onChanged: () => Promise<void>;
  onDeleted: (result: "DELETED" | "ARCHIVED") => void;
}) {
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);

  return (
    <div className="flex items-center justify-between gap-2 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{account.name}</p>
        <p className="text-xs text-muted-foreground">{account.currency}</p>
      </div>
      <div className="flex items-center gap-1">
        <p className={`tabular-nums ${Number(account.balance) < 0 ? "text-destructive" : ""}`}>
          {account.balance} {account.currency}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-11" aria-label={`Acciones de ${account.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setActiveDialog("rename")}>Editar nombre</DropdownMenuItem>
            {account.kind === "ASSET" && (
              <DropdownMenuItem onSelect={() => setActiveDialog("balance")}>Actualizar saldo</DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onSelect={() => setActiveDialog("delete")}>
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {activeDialog === "rename" && (
        <RenameAccountDialog account={account} onClose={() => setActiveDialog(null)} onSaved={onChanged} />
      )}
      {activeDialog === "balance" && (
        <UpdateBalanceDialog account={account} onClose={() => setActiveDialog(null)} onSaved={onChanged} />
      )}
      {activeDialog === "delete" && (
        <DeleteAccountDialog
          account={account}
          onClose={() => setActiveDialog(null)}
          onSaved={onChanged}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}
