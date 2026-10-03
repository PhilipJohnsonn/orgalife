import type { Prisma } from "@/app/generated/prisma/client";
import { Decimal } from "@prisma/client/runtime/client";
import { getCurrentUsdRates } from "@/app/lib/exchange-rate-service";
import { convertUsdPivotAmount } from "@/app/lib/finance-rates";
import { calculateNativeBalance, type LedgerAccountKindValue } from "@/app/lib/ledger";
import { PersonError, assertPersonArchivable, parsePersonName } from "@/app/lib/finance-people";
import { prisma } from "@/app/lib/prisma";

type PersonBalance = { currency: string; balance: string };

/** Balance per currency of each person's ledger accounts. Positive = te debe; negative = le debés. */
export async function balancesByPerson(
  personIds?: string[],
  client: Prisma.TransactionClient = prisma
): Promise<Map<string, PersonBalance[]>> {
  const accounts = await client.ledgerAccount.findMany({
    where: { personId: personIds ? { in: personIds } : { not: null } },
    select: {
      personId: true,
      currency: true,
      kind: true,
      postings: { select: { side: true, amount: true, journalEntry: { select: { status: true } } } },
    },
    orderBy: { currency: "asc" },
  });
  const result = new Map<string, PersonBalance[]>();
  for (const account of accounts) {
    const balance = calculateNativeBalance(
      account.kind as LedgerAccountKindValue,
      account.postings.map((posting) => ({
        side: posting.side,
        amount: posting.amount.toFixed(2),
        entryStatus: posting.journalEntry.status,
      }))
    );
    const list = result.get(account.personId!) ?? [];
    list.push({ currency: account.currency.trim(), balance });
    result.set(account.personId!, list);
  }
  return result;
}

async function activePerson(id: string) {
  const person = await prisma.person.findUnique({ where: { id } });
  if (!person || person.archivedAt) throw new PersonError("PERSON_NOT_FOUND", 404, "La persona no existe");
  return person;
}

async function assertNameAvailable(name: string, exceptId?: string) {
  const existing = await prisma.person.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, archivedAt: null, id: exceptId ? { not: exceptId } : undefined },
  });
  if (existing) throw new PersonError("PERSON_EXISTS", 409, `Ya existe ${existing.name}`);
}

/** Active people with their non-zero balances. */
export async function listPeople() {
  const people = await prisma.person.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } });
  const balances = await balancesByPerson(people.map((person) => person.id));
  return people.map((person) => ({
    id: person.id,
    name: person.name,
    balances: (balances.get(person.id) ?? []).filter((item) => Number(item.balance) !== 0),
  }));
}

/**
 * Active people with balances per currency plus an approximate net in AUD
 * (informative, current rates). `netAud` is null when a rate is missing.
 */
export async function listPeopleBalances() {
  const people = await listPeople();
  const currencies = [...new Set(people.flatMap((person) => person.balances.map((item) => item.currency)))];
  const snapshots = await getCurrentUsdRates([...currencies, "AUD"]);
  const rates = new Map([...snapshots.entries()].map(([currency, snapshot]) => [currency, snapshot.rate.toFixed(8)]));
  return people.map((person) => {
    let net = new Decimal(0);
    for (const item of person.balances) {
      const converted = convertUsdPivotAmount(item.balance, item.currency, "AUD", rates);
      if (converted === null) return { ...person, netAud: null };
      net = net.add(converted);
    }
    return { ...person, netAud: net.toFixed(2) };
  });
}

/** People holding a non-zero balance in a currency, for blocking its removal. */
export async function peopleWithBalanceIn(currency: string) {
  const balances = await balancesByPerson();
  const ids = [...balances].filter(([, list]) =>
    list.some((item) => item.currency === currency && Number(item.balance) !== 0)
  ).map(([id]) => id);
  if (ids.length === 0) return [];
  return prisma.person.findMany({ where: { id: { in: ids } }, select: { name: true }, orderBy: { name: "asc" } });
}

export async function createPerson(input: unknown) {
  const name = parsePersonName(input);
  await assertNameAvailable(name);
  const person = await prisma.person.create({ data: { name } });
  return { id: person.id, name: person.name, balances: [] };
}

export async function renamePerson(id: string, input: unknown) {
  const name = parsePersonName(input);
  await activePerson(id);
  await assertNameAvailable(name, id);
  const person = await prisma.person.update({ where: { id }, data: { name } });
  return { id: person.id, name: person.name };
}

/**
 * Deletes a person who never had an account; otherwise archives them (and
 * their accounts) so past entries keep their history. Requires every balance at zero.
 */
export async function removePerson(id: string) {
  const person = await activePerson(id);
  const accounts = await prisma.ledgerAccount.count({ where: { personId: id } });
  if (accounts === 0) {
    await prisma.person.delete({ where: { id } });
    return { result: "DELETED" as const };
  }
  assertPersonArchivable(person.name, (await balancesByPerson([id])).get(id) ?? []);
  await prisma.$transaction([
    prisma.ledgerAccount.updateMany({ where: { personId: id }, data: { isActive: false } }),
    prisma.person.update({ where: { id }, data: { archivedAt: new Date() } }),
  ]);
  return { result: "ARCHIVED" as const };
}

const HIDDEN_STATUSES = ["REVERSED"] as const;

/**
 * Shared expenses and settlements, newest first, with what each one did to
 * every person's balance (positive = they owe you more), read from postings.
 */
export async function listPeopleHistory(limit = 100) {
  const entries = await prisma.journalEntry.findMany({
    where: {
      operationType: { in: ["SHARED_EXPENSE", "PERSON_SETTLEMENT"] },
      status: { notIn: [...HIDDEN_STATUSES] },
    },
    include: {
      postings: {
        where: { ledgerAccount: { personId: { not: null } } },
        include: { ledgerAccount: { select: { currency: true, person: { select: { id: true, name: true } } } } },
      },
    },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  return entries.map((entry) => ({
    id: entry.id,
    kind: entry.operationType as "SHARED_EXPENSE" | "PERSON_SETTLEMENT",
    occurredOn: entry.occurredOn.toISOString().slice(0, 10),
    description: entry.description,
    people: entry.postings.map((posting) => ({
      personId: posting.ledgerAccount.person!.id,
      name: posting.ledgerAccount.person!.name,
      currency: posting.ledgerAccount.currency.trim(),
      amount: (posting.side === "DEBIT" ? posting.amount : posting.amount.neg()).toFixed(2),
    })),
  }));
}
