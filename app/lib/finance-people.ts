export class PersonError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "PersonError";
    this.code = code;
    this.status = status;
  }
}

export const PERSON_NAME_MAX_LENGTH = 60;

export function parsePersonName(input: unknown): string {
  const name = typeof input === "string" ? input.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new PersonError("PERSON_NAME_REQUIRED", 422, "El nombre es obligatorio");
  if (name.length > PERSON_NAME_MAX_LENGTH) {
    throw new PersonError("PERSON_NAME_TOO_LONG", 422, `El nombre admite hasta ${PERSON_NAME_MAX_LENGTH} caracteres`);
  }
  return name;
}

/** A person can only be archived once every currency balance is back to zero. */
export function assertPersonArchivable(name: string, balances: { currency: string; balance: string }[]) {
  const open = balances.filter((item) => Number(item.balance) !== 0);
  if (open.length > 0) {
    throw new PersonError(
      "PERSON_HAS_BALANCE",
      409,
      `${name} tiene saldo ${open.map((item) => `${item.balance} ${item.currency}`).join(", ")}. Llevá el saldo a 0 primero.`
    );
  }
}
