# ICBC Visa parser fixtures

This directory defines the fixture boundary for RFC 001. Real statements are private inputs and must never be committed.

## Private input

Place real PDFs under:

```text
tests/fixtures/finance/icbc-visa/private/
```

That directory is ignored by Git. Use 2–4 statements and, when possible, consecutive cycles containing an eligible USD-related tax.

Never copy a real PDF, full extracted text, name, address, document number, account number, full/partial card number, barcode or bank reference into a committed fixture.

## Committed fixture shape

The Stage 4 parser will separate PDF extraction from classification. Committed fixtures use sanitized layout items instead of the source PDF:

```text
<case>.items.json
<case>.expected.json
```

`<case>.items.json`:

```json
{
  "parser": "ICBC_VISA",
  "sourceVersion": 1,
  "items": [
    { "page": 1, "str": "01.07.26", "x": 42, "y": 510 },
    { "page": 1, "str": "STREAMING EXAMPLE", "x": 152, "y": 510 },
    { "page": 1, "str": "10,00", "x": 548, "y": 510 }
  ]
}
```

`<case>.expected.json` contains normalized statement metadata, totals, lines, classifications and the reconciliation result. Amounts are decimal strings.

## Required cases

- ARS purchase;
- USD-billed purchase;
- THB or IDR original currency billed in USD;
- billed installment with original purchase date;
- eligible tax excluded from payment;
- payable tax/interest/fee;
- previous balance;
- payment or credit;
- consecutive-cycle tax resolution;
- multiple pages;
- duplicate-looking descriptions;
- unsupported layout;
- corrupt/non-PDF upload is covered outside layout fixtures.

## Anonymization contract

1. Extract layout items locally from the private PDF.
2. Replace every personal/bank identifier and merchant with synthetic values while preserving the text format and coordinates needed by the parser.
3. Replace amounts consistently so statement equations still close to `0.01` per currency.
4. Keep original currency codes, installment syntax, dates and tax keywords only when required by the test.
5. Review the staged diff manually before commit.
6. Search the fixture for the real name, account/card suffixes, address and known identifiers.

The repository fixture is acceptable only when the parser behavior is reproducible without the original PDF.

## Available sanitized cases

`consecutive-tax-credit-01` through `consecutive-tax-credit-04` are derived from four consecutive ICBC Visa statements inspected locally on 2026-08-10. They intentionally use synthetic dates, merchants, identifiers and amounts.

Together they cover:

- ARS and USD totals;
- THB, IDR and AUD original currency billed in USD;
- prior balance and payments in both billed currencies;
- the eligible `DB.RG 5617` tax excluded from the ARS payment;
- the matching `DEV.IMP. RG 5617` credit in the next cycle;
- payable stamp tax;
- multiple pages, duplicated PDF text items and duplicate-looking descriptions;
- legal and Plan V regions that the parser must ignore.

The four private statements do not contain a billed installment line or an actual financing-interest charge. Those two cases remain explicit fixture gaps: do not infer their layout from the Plan V marketing/legal block.
