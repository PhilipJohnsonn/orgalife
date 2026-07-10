// Construye el data de una Transaction derivada de un CardExpense confirmado.
export function buildTransactionData(
  expense: {
    id: string;
    description: string;
    purchaseDate: Date | null;
    installmentInfo: string | null;
    amountARS: number | null;
    amountUSD: number | null;
  },
  cardName: string,
  dueDate: Date | null,
  exchangeRate?: number
) {
  const isARS = expense.amountARS != null;
  const amount = isARS ? expense.amountARS! : expense.amountUSD!;
  const amountUSD =
    expense.amountUSD ??
    (isARS && exchangeRate && exchangeRate > 0 ? expense.amountARS! / exchangeRate : null);
  // Las cuotas traen la fecha de la compra original (meses atrás) — se pagan con este resumen.
  const date = expense.installmentInfo
    ? dueDate ?? new Date()
    : expense.purchaseDate ?? dueDate ?? new Date();

  return {
    type: "EXPENSE" as const,
    description: expense.description,
    amount,
    currency: isARS ? "ARS" : "USD",
    amountUSD,
    date,
    method: "CREDIT" as const,
    cardName,
    cardExpenseId: expense.id,
  };
}
