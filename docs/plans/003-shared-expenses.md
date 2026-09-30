# Plan 003 — Gastos compartidos y monedas habilitadas

Objetivo: dividir gastos con otras personas (partes iguales por defecto), registrar gastos que pagó otro, acumular el saldo por persona y saldarlo en ambas direcciones, estilo Splitwise/Tricount/Settle Up. Soporta viajes multimoneda. El ledger de doble entrada (RFC 001) sigue siendo la fuente de verdad: no hay módulo paralelo.

## Decisiones

- App de un solo usuario: todo se registra desde el lado del dueño. No hay "simplificar deudas" ni gastos entre terceros.
- Una cuenta de ledger por persona y moneda (`kind` `RECEIVABLE`, `subtype` `PERSON`, `personId`), creada a demanda. Saldo positivo = te debe; negativo = le debés. No se reusa `Obligation` (queda para préstamos).
- Gasto = tu parte. Lo que pagaste por otros va a la cuenta de la persona; no infla gastos. Un cobro posterior no es ingreso.
- División por defecto en partes iguales entre vos y las personas elegidas; alternativas: montos exactos o porcentajes (deben sumar el total). Centavos sobrantes van a tu parte.
- Pagaste vos: la deuda queda en la moneda de la cuenta que se movió (incluye comisiones FX de la tarjeta); el monto original en otra moneda queda como referencia. Pagó otro: la deuda queda en la moneda en que pagó.
- Saldos por moneda por persona, con neto aproximado en AUD (informativo).
- Saldar: misma moneda (cuenta ↔ persona) o en otra moneda con dos montos vía clearing FX. No es gasto ni ingreso.
- Monedas: se habilitan a mano en Ajustes; no hay lista global de ISO. El + y "Nueva cuenta" usan sólo las habilitadas.
- Todo se anota en el momento (Apple Pay o a mano), con tarjeta o no; no se importan resúmenes (decisión 2026-09-30). Las compras con tarjeta se registran confirmadas y la tarjeta es un pagador más en un gasto compartido.
- "Dividir" un movimiento ya capturado (`EXPENSE` o `CARD_PURCHASE` confirmado) lo revierte y registra el `SHARED_EXPENSE` (sin mutar postings).
- Resumen mensual: ya suma sólo postings de cuentas `EXPENSE`/`INCOME`, así que cuenta tu parte sin cambios. Saldos con personas fuera del disponible; dentro de la posición neta.
- Fuera de alcance: grupos/viajes, compartidos recurrentes, link de solo lectura, compensar deudas entre monedas sin mover dinero, reconciliar compartidos con resúmenes de tarjeta.

## Asientos

| Caso | Débito | Crédito |
|---|---|---|
| Pagué yo 60, entre 3 | Gasto 20 + Persona A 20 + Persona B 20 | Cuenta 60 |
| Pagó A 60, entre 3 | Gasto 20 | Persona A 20 |
| A me paga | Cuenta | Persona A |
| Le pago a A | Persona A | Cuenta |

## Contratos nuevos

- `EnabledCurrency` (`code` ISO 4217, `createdAt`); `GET/POST/DELETE /api/finance/v1/currencies`.
- `Person` (`name`, `archivedAt`); `LedgerAccount.personId`; `LedgerAccountSubtype.PERSON`; CRUD `/api/finance/v1/people`.
- `JournalOperationType`: `SHARED_EXPENSE`, `PERSON_SETTLEMENT`.

## Pasos

| # | Paso | Verificación |
|---|------|--------------|
| 1 | Monedas habilitadas: tabla (seed AUD/USD/ARS + monedas de cuentas existentes), servicio + API (validar ISO; no quitar si la usa una cuenta activa o una persona con saldo), sección "Monedas" en Ajustes, el + y "Nueva cuenta" leen de ahí | Unit validación/bloqueo, integration API, Playwright: agregar EUR y verlo en el + |
| 2 | Personas: modelo, `personId`, subtipo `PERSON`, CRUD, archivar sólo con saldo 0, sección en Ajustes | Integration alta/edición/archivo con y sin saldo, Playwright |
| 3 | Backend gasto compartido: módulo puro `shared-expense.ts` (iguales/montos/porcentajes, redondeo) + `recordSharedExpense` | Unit de división; integration: asiento balanceado en pagué yo / pagó otro / 3 personas / moneda extranjera; resumen cuenta sólo tu parte |
| 4 | Saldar misma moneda y cross-currency + endpoint de saldos por persona/moneda con neto AUD | Integration parcial, total, cross-currency; saldo vuelve a 0 |
| 5 | Tarjeta como pagador en `recordSharedExpense`; "Dividir" movimiento existente, gasto o compra con tarjeta (reversión + `SHARED_EXPENSE`) | Integration: pagó con tarjeta; original revertido, sin doble conteo, idempotente |
| 6 | UI: sección "Compartido" plegada en Gasto del +; Movimientos muestra "Total 60 · tu parte 20" | Lint, typecheck, Playwright 390 en los tres casos |
| 7 | Pantalla `/finanzas/compartidos`: saldos, historial, "Me pagó" / "Le pagué"; entrada en la navegación | Playwright 390/1440, saldos = ledger, gate completo (lint, typecheck, unit, integration, build) |

Commit local al cerrar cada paso; push sólo con pedido explícito.

## Acciones del usuario

- Configurar `OPEN_EXCHANGE_RATES_APP_ID` en el `.env` del VPS antes de usar monedas extra: sin cotización el resumen no convierte EUR/otras a AUD.
