import { Prisma } from "@/app/generated/prisma/client";
import type { RecurringCommitmentCommand } from "@/app/lib/finance-v1-contracts";
import { parseCivilDate } from "@/app/lib/ledger";
import { prisma } from "@/app/lib/prisma";

export class FinanceCommitmentError extends Error {
  readonly code: string;
  readonly status: 404 | 409 | 422;

  constructor(code: string, status: 404 | 409 | 422, message: string) {
    super(message);
    this.name = "FinanceCommitmentError";
    this.code = code;
    this.status = status;
  }
}

const commitmentInclude = {
  category: true,
  expectedAccount: { include: { accountGroup: true } },
} satisfies Prisma.RecurringCommitmentInclude;

function serializeCommitment(
  commitment: Prisma.RecurringCommitmentGetPayload<{ include: typeof commitmentInclude }>
) {
  return {
    id: commitment.id,
    name: commitment.name,
    expectedAmount: commitment.expectedAmount.toFixed(2),
    currency: commitment.currency.trim(),
    frequency: commitment.frequency,
    startsOn: commitment.startsOn.toISOString().slice(0, 10),
    endsOn: commitment.endsOn?.toISOString().slice(0, 10) ?? null,
    status: commitment.status,
    category: commitment.category,
    expectedAccount: commitment.expectedAccount
      ? {
          id: commitment.expectedAccount.id,
          name: commitment.expectedAccount.name,
          groupName: commitment.expectedAccount.accountGroup?.name ?? null,
        }
      : null,
  };
}

export async function createRecurringCommitment(command: RecurringCommitmentCommand) {
  if (command.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: command.categoryId } });
    if (!category) {
      throw new FinanceCommitmentError("CATEGORY_NOT_FOUND", 404, "Category not found");
    }
  }
  if (command.expectedAccountId) {
    const account = await prisma.ledgerAccount.findUnique({
      where: { id: command.expectedAccountId },
    });
    if (!account || !account.isActive || account.isSystem) {
      throw new FinanceCommitmentError("ACCOUNT_NOT_FOUND", 404, "Expected account not found");
    }
    if (account.currency.trim() !== command.currency) {
      throw new FinanceCommitmentError(
        "COMMITMENT_CURRENCY_MISMATCH",
        422,
        "Commitment and expected account must use the same currency"
      );
    }
  }
  return prisma.recurringCommitment.create({
    data: {
      name: command.name,
      expectedAmount: command.expectedAmount,
      currency: command.currency,
      frequency: command.frequency,
      startsOn: parseCivilDate(command.startsOn),
      endsOn: command.endsOn ? parseCivilDate(command.endsOn) : null,
      categoryId: command.categoryId,
      expectedAccountId: command.expectedAccountId,
    },
    include: commitmentInclude,
  }).then(serializeCommitment);
}

export async function cancelRecurringCommitment(commitmentId: string) {
  const commitment = await prisma.recurringCommitment.findUnique({
    where: { id: commitmentId },
  });
  if (!commitment) {
    throw new FinanceCommitmentError("COMMITMENT_NOT_FOUND", 404, "Commitment not found");
  }
  if (commitment.status === "CANCELLED") {
    return prisma.recurringCommitment.findUniqueOrThrow({
      where: { id: commitment.id },
      include: commitmentInclude,
    }).then(serializeCommitment);
  }
  return prisma.recurringCommitment.update({
    where: { id: commitment.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
    include: commitmentInclude,
  }).then(serializeCommitment);
}

export async function listRecurringCommitments() {
  const commitments = await prisma.recurringCommitment.findMany({
    include: commitmentInclude,
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  const active = commitments.filter((commitment) => commitment.status === "ACTIVE");
  const totals = new Map<string, { once: Prisma.Decimal; weekly: Prisma.Decimal; monthly: Prisma.Decimal; monthlyAverage: Prisma.Decimal }>();
  for (const commitment of active) {
    const currency = commitment.currency.trim();
    const current = totals.get(currency) ?? {
      once: new Prisma.Decimal(0),
      weekly: new Prisma.Decimal(0),
      monthly: new Prisma.Decimal(0),
      monthlyAverage: new Prisma.Decimal(0),
    };
    if (commitment.frequency === "ONCE") current.once = current.once.plus(commitment.expectedAmount);
    if (commitment.frequency === "WEEKLY") {
      current.weekly = current.weekly.plus(commitment.expectedAmount);
      current.monthlyAverage = current.monthlyAverage.plus(commitment.expectedAmount.mul(52).div(12));
    }
    if (commitment.frequency === "MONTHLY") {
      current.monthly = current.monthly.plus(commitment.expectedAmount);
      current.monthlyAverage = current.monthlyAverage.plus(commitment.expectedAmount);
    }
    totals.set(currency, current);
  }
  return {
    commitments: commitments.map(serializeCommitment),
    totals: [...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, value]) => ({
      currency,
      once: value.once.toFixed(2),
      weekly: value.weekly.toFixed(2),
      monthly: value.monthly.toFixed(2),
      monthlyAverage: value.monthlyAverage.toDecimalPlaces(2).toFixed(2),
    })),
  };
}
