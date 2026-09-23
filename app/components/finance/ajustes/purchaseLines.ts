import { CardStatement } from "@/app/components/finance/cierre/shared";

export type PurchaseLine = CardStatement["lines"][number] & {
  statementStatus: CardStatement["status"];
  closingOn: string;
};

export function derivePurchaseLines(statements: CardStatement[]): PurchaseLine[] {
  return statements
    .filter((statement) => statement.status !== "REVERSED")
    .flatMap((statement) =>
      statement.lines
        .filter((line) => line.paymentTreatment === "PAYABLE" && ["PURCHASE", "FEE", "INTEREST"].includes(line.classification))
        .map((line) => ({ ...line, statementStatus: statement.status, closingOn: statement.closingOn }))
    );
}
