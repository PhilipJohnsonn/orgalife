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

export function calculateStatementTotal(statement: {
  amountARS: number | null;
  amountUSD: number | null;
  expenses: Array<{
    amountARS: number | null;
    amountUSD: number | null;
    isExcluded: boolean;
  }>;
}) {
  if (statement.expenses.length === 0) {
    return {
      totalARS: statement.amountARS ?? 0,
      totalUSD: statement.amountUSD ?? 0,
      totalExcludedARS: 0,
    };
  }

  const included = statement.expenses.filter((expense) => !expense.isExcluded);
  const excluded = statement.expenses.filter((expense) => expense.isExcluded);

  return {
    totalARS: included.reduce((sum, expense) => sum + (expense.amountARS ?? 0), 0),
    totalUSD: included.reduce((sum, expense) => sum + (expense.amountUSD ?? 0), 0),
    totalExcludedARS: excluded.reduce(
      (sum, expense) => sum + (expense.amountARS ?? 0),
      0
    ),
  };
}
