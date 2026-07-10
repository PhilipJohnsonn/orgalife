"use client";

import { useRef, useState } from "react";
import { CardStatement, CardExpense } from "./types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Upload, CreditCard, ChevronDown, ChevronRight, Check } from "lucide-react";

interface Props {
  statements: CardStatement[];
  onUpdate: () => void;
}

const TAX_KEYWORDS = ["PERCEP", "IMP PAIS", "IMP AL VALOR", "IMPUESTO", "SELLO", "INTERES", "CARGO FINANCIERO", "RECARGO", "COMISION"];

function calcStatementTotal(statement: CardStatement) {
  const included = statement.expenses.filter((e) => !e.isExcluded);
  const excluded = statement.expenses.filter((e) => e.isExcluded);
  const totalARS = included.reduce((s, e) => s + (e.amountARS ?? 0), 0);
  const totalUSD = included.reduce((s, e) => s + (e.amountUSD ?? 0), 0);
  const totalExcludedARS = excluded.reduce((s, e) => s + (e.amountARS ?? 0), 0);
  return { totalARS, totalUSD, totalExcludedARS };
}

function isTaxDescription(desc: string) {
  const upper = desc.toUpperCase();
  return TAX_KEYWORDS.some((kw) => upper.includes(kw));
}

interface ParsedExpense {
  description: string;
  installmentInfo: string | null;
  originalCurrency: string | null;
  originalAmount: number | null;
  amountARS: number | null;
  amountUSD: number | null;
  isExcluded: boolean;
  excludeReason: string | null;
}

interface UploadState {
  loading: boolean;
  cardName: string;
  dueDate: string;
  expenses: ParsedExpense[];
}

export function CardStatements({ statements, onUpdate }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [addManual, setAddManual] = useState(false);
  const [manualForm, setManualForm] = useState({ cardName: "VISA", amountUSD: "", amountARS: "", dueDate: "" });

  const totalCardARS = statements.reduce((sum, s) => {
    const { totalARS } = calcStatementTotal(s);
    return sum + totalARS;
  }, 0);
  const totalCardUSD = statements.reduce((sum, s) => {
    const { totalUSD } = calcStatementTotal(s);
    return sum + totalUSD;
  }, 0);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUpload({ loading: true, cardName: "VISA", dueDate: "", expenses: [] });

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/finance/statements/upload", { method: "POST", body: formData });
    const data = await res.json();

    if (res.ok) {
      setUpload({ loading: false, cardName: "VISA", dueDate: "", expenses: data.expenses });
    } else {
      alert(data.error ?? "Error al procesar el PDF");
      setUpload(null);
    }

    if (fileRef.current) fileRef.current.value = "";
  }

  function toggleUploadExpense(idx: number) {
    if (!upload) return;
    const updated = upload.expenses.map((e, i) =>
      i === idx ? { ...e, isExcluded: !e.isExcluded, excludeReason: !e.isExcluded ? "Excluido manualmente" : null } : e
    );
    setUpload({ ...upload, expenses: updated });
  }

  async function confirmUpload() {
    if (!upload) return;
    const included = upload.expenses.filter((e) => !e.isExcluded);
    const totalARS = included.reduce((s, e) => s + (e.amountARS ?? 0), 0);
    const totalUSD = included.reduce((s, e) => s + (e.amountUSD ?? 0), 0);

    await fetch("/api/finance/statements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardName: upload.cardName,
        amountARS: totalARS || null,
        amountUSD: totalUSD || null,
        dueDate: upload.dueDate || null,
        expenses: upload.expenses,
      }),
    });
    setUpload(null);
    onUpdate();
  }

  async function togglePaid(statement: CardStatement) {
    await fetch(`/api/finance/statements/${statement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPaid: !statement.isPaid }),
    });
    onUpdate();
  }

  async function toggleExpenseExcluded(expense: CardExpense) {
    await fetch(`/api/finance/expenses/${expense.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isExcluded: !expense.isExcluded,
        excludeReason: !expense.isExcluded ? "Excluido manualmente" : null,
      }),
    });
    onUpdate();
  }

  async function deleteStatement(id: string) {
    if (!confirm("¿Eliminar este resumen?")) return;
    await fetch(`/api/finance/statements/${id}`, { method: "DELETE" });
    onUpdate();
  }

  async function saveManual() {
    await fetch("/api/finance/statements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardName: manualForm.cardName,
        amountUSD: manualForm.amountUSD ? parseFloat(manualForm.amountUSD) : null,
        amountARS: manualForm.amountARS ? parseFloat(manualForm.amountARS) : null,
        dueDate: manualForm.dueDate || null,
      }),
    });
    setAddManual(false);
    setManualForm({ cardName: "VISA", amountUSD: "", amountARS: "", dueDate: "" });
    onUpdate();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4" /> Tarjetas
        </CardTitle>
        <div className="flex items-center gap-2">
          {(totalCardARS > 0 || totalCardUSD > 0) && (
            <span className="text-sm text-muted-foreground">
              Total:{" "}
              {totalCardUSD > 0 && <span className="font-semibold text-foreground">U${totalCardUSD.toFixed(2)} + </span>}
              <span className="font-semibold text-foreground">${totalCardARS.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</span>
            </span>
          )}
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3 w-3 mr-1" /> Subir PDF
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAddManual(true)}>
            Manual
          </Button>
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Upload preview */}
        {upload && (
          <div className="border rounded-lg p-3 space-y-3 bg-blue-50 dark:bg-blue-950/20">
            {upload.loading ? (
              <p className="text-sm text-center py-4 text-muted-foreground">Procesando PDF…</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Tarjeta</Label>
                    <select
                      className="w-full h-8 text-sm mt-1 border rounded px-2 bg-background"
                      value={upload.cardName}
                      onChange={(e) => setUpload({ ...upload, cardName: e.target.value })}
                    >
                      <option>VISA</option>
                      <option>MASTER</option>
                      <option>AMEX</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Fecha de pago</Label>
                    <Input
                      type="date"
                      value={upload.dueDate}
                      onChange={(e) => setUpload({ ...upload, dueDate: e.target.value })}
                      className="h-8 text-sm mt-1"
                    />
                  </div>
                  <div className="flex items-end">
                    <span className="text-xs text-muted-foreground">
                      {upload.expenses.length} items · {upload.expenses.filter((e) => e.isExcluded).length} excluidos
                    </span>
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1 border rounded p-2 bg-background">
                  {upload.expenses.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No se encontraron ítems. El formato del PDF puede no ser compatible.
                    </p>
                  ) : (
                    upload.expenses.map((exp, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-2 px-2 py-1 rounded text-sm ${exp.isExcluded ? "opacity-40 line-through" : ""}`}
                      >
                        <Switch
                          checked={!exp.isExcluded}
                          onCheckedChange={() => toggleUploadExpense(idx)}
                          className="scale-75"
                        />
                        <span className="flex-1 truncate">{exp.description}</span>
                        {exp.installmentInfo && (
                          <Badge variant="outline" className="text-xs shrink-0">{exp.installmentInfo}</Badge>
                        )}
                        {exp.originalCurrency && exp.originalAmount != null && exp.originalCurrency !== "USD" && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {exp.originalCurrency} {exp.originalAmount.toLocaleString("es-AR")}
                          </span>
                        )}
                        {exp.amountUSD != null && (
                          <span className="font-medium shrink-0 text-blue-600 dark:text-blue-400">
                            U${exp.amountUSD.toFixed(2)}
                          </span>
                        )}
                        {exp.amountARS != null && (
                          <span className="font-medium shrink-0">
                            ${exp.amountARS.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                          </span>
                        )}
                        {isTaxDescription(exp.description) && (
                          <Badge variant="secondary" className="text-xs shrink-0">impuesto</Badge>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">
                    Total incluido:{" "}
                    {upload.expenses.filter((e) => !e.isExcluded).reduce((s, e) => s + (e.amountUSD ?? 0), 0) > 0 && (
                      <span className="text-blue-600 dark:text-blue-400">
                        U${upload.expenses.filter((e) => !e.isExcluded).reduce((s, e) => s + (e.amountUSD ?? 0), 0).toFixed(2)}
                        {upload.expenses.filter((e) => !e.isExcluded).some((e) => e.amountARS) && " + "}
                      </span>
                    )}
                    {upload.expenses.filter((e) => !e.isExcluded).some((e) => e.amountARS) && (
                      <span>${upload.expenses.filter((e) => !e.isExcluded).reduce((s, e) => s + (e.amountARS ?? 0), 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}</span>
                    )}
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setUpload(null)}>Cancelar</Button>
                    <Button size="sm" onClick={confirmUpload}>Confirmar y guardar</Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Manual add */}
        {addManual && (
          <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Tarjeta</Label>
                <select
                  className="w-full h-8 text-sm mt-1 border rounded px-2 bg-background"
                  value={manualForm.cardName}
                  onChange={(e) => setManualForm({ ...manualForm, cardName: e.target.value })}
                >
                  <option>VISA</option>
                  <option>MASTER</option>
                  <option>AMEX</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Fecha de pago</Label>
                <Input
                  type="date"
                  value={manualForm.dueDate}
                  onChange={(e) => setManualForm({ ...manualForm, dueDate: e.target.value })}
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Monto USD</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={manualForm.amountUSD}
                  onChange={(e) => setManualForm({ ...manualForm, amountUSD: e.target.value })}
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Monto ARS</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={manualForm.amountARS}
                  onChange={(e) => setManualForm({ ...manualForm, amountARS: e.target.value })}
                  className="h-8 text-sm mt-1"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setAddManual(false)}>Cancelar</Button>
              <Button size="sm" onClick={saveManual}>Guardar</Button>
            </div>
          </div>
        )}

        {statements.length === 0 && !upload && !addManual && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Sin resúmenes. Subí un PDF o agregá manualmente.
          </p>
        )}

        {/* Existing statements */}
        {statements.map((statement) => {
          const { totalARS, totalUSD, totalExcludedARS } = calcStatementTotal(statement);
          const isOpen = expanded === statement.id;

          return (
            <div key={statement.id} className="border rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30" onClick={() => setExpanded(isOpen ? null : statement.id)}>
                {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <span className="font-medium text-sm">{statement.cardName}</span>
                {statement.dueDate && (
                  <span className="text-xs text-muted-foreground">
                    Vence {new Date(statement.dueDate).toLocaleDateString("es-AR")}
                  </span>
                )}
                <div className="flex-1" />
                {totalExcludedARS > 0 && (
                  <span className="text-xs text-muted-foreground line-through">
                    ${(totalARS + totalExcludedARS).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                  </span>
                )}
                <span className="text-sm font-semibold">
                  {totalUSD > 0 && (
                    <span className="text-blue-600 dark:text-blue-400">U${totalUSD.toFixed(2)}{totalARS > 0 ? " + " : ""}</span>
                  )}
                  {totalARS > 0 && `$${totalARS.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); togglePaid(statement); }}
                  className={`shrink-0 ${statement.isPaid ? "text-green-500" : "text-muted-foreground hover:text-green-500"}`}
                  title="Marcar como pagada"
                >
                  <Check className="h-4 w-4" />
                </button>
                {statement.isPaid && <Badge className="text-xs shrink-0 bg-green-500">Pagada</Badge>}
              </div>

              {isOpen && (
                <div className="border-t">
                  {statement.expenses.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sin ítems detallados</p>
                  ) : (
                    <div className="divide-y max-h-80 overflow-y-auto">
                      {statement.expenses.map((expense) => (
                        <div
                          key={expense.id}
                          className={`flex items-center gap-2 px-3 py-2 text-sm ${expense.isExcluded ? "opacity-40" : ""}`}
                        >
                          <Switch
                            checked={!expense.isExcluded}
                            onCheckedChange={() => toggleExpenseExcluded(expense)}
                            className="scale-75 shrink-0"
                          />
                          <span className={`flex-1 truncate ${expense.isExcluded ? "line-through" : ""}`}>
                            {expense.description}
                          </span>
                          {expense.installmentInfo && (
                            <Badge variant="outline" className="text-xs shrink-0">{expense.installmentInfo}</Badge>
                          )}
                          {expense.originalCurrency && expense.originalAmount != null && expense.originalCurrency !== "USD" && (
                            <span className="text-xs text-muted-foreground shrink-0">
                              {expense.originalCurrency} {expense.originalAmount.toLocaleString("es-AR")}
                            </span>
                          )}
                          {expense.amountUSD != null && (
                            <span className="font-medium shrink-0 text-blue-600 dark:text-blue-400">
                              U${expense.amountUSD.toFixed(2)}
                            </span>
                          )}
                          {expense.amountARS != null && (
                            <span className="font-medium shrink-0">
                              ${expense.amountARS.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                            </span>
                          )}
                          {expense.excludeReason && (
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {expense.excludeReason.includes("auto") ? "impuesto" : "excluido"}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end px-3 py-2 border-t">
                    <button
                      onClick={() => deleteStatement(statement.id)}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      Eliminar resumen
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
