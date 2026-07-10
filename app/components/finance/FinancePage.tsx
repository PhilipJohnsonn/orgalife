"use client";

import { useCallback, useEffect, useState } from "react";
import { FinancialAccount, Debt, Category, CardStatement } from "./types";
import { CategoriesList } from "./CategoriesList";
import { CardStatements } from "./CardStatements";
import { DebtsList } from "./DebtsList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Settings } from "lucide-react";

const ACCOUNT_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#6B7280"];

export function FinancePage() {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [statements, setStatements] = useState<CardStatement[]>([]);
  const [exchangeRate, setExchangeRate] = useState(() => {
    if (typeof window !== "undefined") {
      return parseFloat(localStorage.getItem("finance_tc") ?? "") || 1300;
    }
    return 1300;
  });
  const [tcInput, setTcInput] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("finance_tc") ?? "1300";
    }
    return "1300";
  });

  const [accountsOpen, setAccountsOpen] = useState(false);
  const [newAccountForm, setNewAccountForm] = useState({ name: "", currencies: ["USD"] as string[], color: ACCOUNT_COLORS[0] });

  const load = useCallback(async () => {
    const [accountsRes, debtsRes, categoriesRes, statementsRes] = await Promise.all([
      fetch("/api/finance/accounts"),
      fetch("/api/finance/debts"),
      fetch("/api/finance/categories"),
      fetch("/api/finance/statements"),
    ]);
    const [accountsData, debtsData, categoriesData, statementsData] = await Promise.all([
      accountsRes.ok ? accountsRes.json() : [],
      debtsRes.ok ? debtsRes.json() : [],
      categoriesRes.ok ? categoriesRes.json() : [],
      statementsRes.ok ? statementsRes.json() : [],
    ]);
    setAccounts(accountsData);
    setDebts(debtsData);
    setCategories(categoriesData);
    setStatements(statementsData);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleTcBlur() {
    const n = parseFloat(tcInput);
    if (!isNaN(n) && n > 0) {
      setExchangeRate(n);
      localStorage.setItem("finance_tc", String(n));
    } else {
      setTcInput(String(exchangeRate));
    }
  }

  async function addAccount() {
    if (!newAccountForm.name) return;
    await fetch("/api/finance/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newAccountForm),
    });
    setNewAccountForm({ name: "", currencies: ["USD"], color: ACCOUNT_COLORS[0] });
    await load();
  }

  async function deleteAccount(id: string) {
    await fetch(`/api/finance/accounts/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="flex flex-col flex-1 p-4 gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold shrink-0">Finanzas</h1>
        <div className="flex items-center gap-1.5 ml-auto">
          <Label className="text-xs text-muted-foreground shrink-0">TC ARS/USD</Label>
          <Input
            type="number"
            value={tcInput}
            onChange={(e) => setTcInput(e.target.value)}
            onBlur={handleTcBlur}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="h-8 w-24 text-sm"
          />
        </div>
        <Button size="sm" variant="ghost" onClick={() => setAccountsOpen(true)}>
          <Settings className="h-4 w-4 mr-1" /> Cuentas
        </Button>
      </div>

      <Tabs defaultValue="categorias" className="flex-1">
        <TabsList className="mb-4">
          <TabsTrigger value="categorias">Categorías</TabsTrigger>
          <TabsTrigger value="transacciones">Transacciones</TabsTrigger>
          <TabsTrigger value="tarjetas">
            Tarjetas
            {statements.length > 0 && (
              <span className="ml-1.5 text-xs bg-primary/10 text-primary rounded-full px-1.5">
                {statements.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="deudas">Deudas</TabsTrigger>
        </TabsList>

        <TabsContent value="categorias">
          <CategoriesList categories={categories} onUpdate={load} />
        </TabsContent>

        <TabsContent value="transacciones">
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm border rounded-lg">
            Próximamente — paso 3 del plan
          </div>
        </TabsContent>

        <TabsContent value="tarjetas">
          <CardStatements statements={statements} onUpdate={load} />
        </TabsContent>

        <TabsContent value="deudas">
          <DebtsList debts={debts} onUpdate={load} exchangeRate={exchangeRate} />
        </TabsContent>
      </Tabs>

      {/* Accounts manager dialog */}
      <Dialog open={accountsOpen} onOpenChange={setAccountsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Gestionar cuentas</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {accounts.map((account) => (
                <div key={account.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/40">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: account.color }} />
                  <span className="text-sm font-medium flex-1">{account.name}</span>
                  <span className="text-xs text-muted-foreground">{account.currencies.join(" · ")}</span>
                  <button
                    onClick={() => deleteAccount(account.id)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </button>
                </div>
              ))}
              {accounts.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">Sin cuentas</p>
              )}
            </div>
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase">Agregar cuenta</p>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="ICBC, Airtm..."
                  value={newAccountForm.name}
                  onChange={(e) => setNewAccountForm({ ...newAccountForm, name: e.target.value })}
                  className="h-8 text-sm col-span-2"
                />
                <div className="flex gap-1 flex-wrap col-span-2">
                  {["USD", "ARS", "EUR", "UYU"].map((c) => {
                    const selected = newAccountForm.currencies.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewAccountForm({
                          ...newAccountForm,
                          currencies: selected
                            ? newAccountForm.currencies.filter((x) => x !== c)
                            : [...newAccountForm.currencies, c],
                        })}
                        className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${selected ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-1">
                  {ACCOUNT_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`w-6 h-6 rounded-full border-2 ${newAccountForm.color === color ? "border-foreground" : "border-transparent"}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setNewAccountForm({ ...newAccountForm, color })}
                    />
                  ))}
                </div>
              </div>
              <Button size="sm" className="w-full" onClick={addAccount}>Agregar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
