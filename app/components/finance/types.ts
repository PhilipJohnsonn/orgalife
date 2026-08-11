export interface FinancialAccount {
  id: string;
  name: string;
  currencies: string[];
  color: string;
  isActive: boolean;
  createdAt: string;
}

export interface CardExpense {
  id: string;
  statementId: string;
  description: string;
  purchaseDate: string | null;
  installmentInfo: string | null;
  originalCurrency: string | null;
  originalAmount: number | null;
  amountARS: number | null;
  amountUSD: number | null;
  isExcluded: boolean;
  excludeReason: string | null;
}

export interface CardStatement {
  id: string;
  cardName: string;
  amountUSD: number | null;
  amountARS: number | null;
  dueDate: string | null;
  isPaid: boolean;
  rawText: string | null;
  createdAt: string;
  expenses: CardExpense[];
}

export interface Debt {
  id: string;
  description: string;
  creditor: string | null;
  amountUSD: number | null;
  amountARS: number | null;
  isIncluded: boolean;
  isPaid: boolean;
  dueDate: string | null;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: "INCOME" | "EXPENSE";
  description: string;
  amount: number;
  currency: string;
  amountUSD: number | null;
  date: string;
  isRecurring: boolean;
  method: "CASH" | "DEBIT" | "CREDIT" | "TRANSFER";
  cardName: string | null;
  accountId: string | null;
  categoryId: string | null;
  cardExpenseId: string | null;
  account: FinancialAccount | null;
  category: Category | null;
  createdAt: string;
  updatedAt: string;
}
