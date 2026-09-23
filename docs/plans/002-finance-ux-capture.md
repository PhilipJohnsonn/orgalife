# Plan 002 — Finance UX + captura sin fricción

Objetivo: responder "este mes gané X, gasté Y, ¿en qué?" con captura casi automática desde el iPhone. El ledger v1 (RFC 001) no cambia; se agrega una capa de captura y se reorganiza la UI por frecuencia de uso.

## Decisiones

- Captura diaria: Atajos de iOS. Automatización "Transacción" de Wallet (Apple Pay) + atajo manual en doble tap atrás (Gasto / Transferencia a terceros / Ingreso). El atajo pregunta la categoría (lista dinámica desde la API); si se omite queda "Sin categoría".
- Pagar a terceros (renta a la novia) es un gasto, no una transferencia del ledger. Transferencias del ledger = solo entre cuentas propias (desde la web).
- Tarjeta ICBC (pasivo): una compra Apple Pay se registra como compra provisional en la moneda facturada (USD); si la compra es en otra moneda se convierte con la última cotización y se reconcilia al importar el resumen.
- Vista en AUD con equivalente USD. Referencia ARS: cotización oficial (Open Exchange Rates, ya integrado).
- Sueldo AU: se carga el neto por pago. Sueldo AR: carga manual mensual.
- Navegación: rutas `/finanzas/{mes,movimientos,cierre,ajustes}`. Barra inferior sólo en móvil y sólo en Finanzas; tabs arriba en desktop.
- Mes: Ingresos / Gastos / Neto, ranking por categoría, delta vs mes anterior, aviso "sin categoría".
- Las 8 KPIs actuales, resúmenes ICBC, obligaciones y cotización se mueven a Cierre. Cuentas, alias de Wallet, categorías/reglas y compromisos a Ajustes.
- Botón (+) en la web para gasto / ingreso / transferencia propia.

## Contratos nuevos

- `CAPTURE_API_KEY`: bearer válido sólo bajo `/api/finance/v1/quick-capture`.
- `POST /api/finance/v1/quick-capture` `{ kind, amount, currency?, merchant, card?, accountId?, categoryId?, note?, occurredAt, idempotencyKey? }` — `amount` acepta formato Wallet (`A$12.50`). `occurredAt` = `yyyy-MM-ddTHH:mm` local.
- `GET /api/finance/v1/quick-capture/options` → categorías y cuentas.
- `WalletCardAlias`: nombre de tarjeta en Wallet → `LedgerAccount`.
- `GET /api/finance/v1/monthly-summary?month=YYYY-MM`, `GET /api/finance/v1/monthly-movements?month=YYYY-MM`, `PATCH /api/finance/v1/entries/:id/category`.

## Pasos

| # | Paso | Verificación |
|---|------|--------------|
| A1 | Token de captura en `proxy.ts` | Unit: allow/forbid/401 |
| A2 | `WalletCardAlias` + migración + CRUD API | Migración aplicada, typecheck |
| A3 | `POST quick-capture` | Unit parser/resolución; curl idempotente |
| A4 | `GET quick-capture/options` | curl con token |
| A5 | Guía de atajos (`docs/runbooks/ios-shortcuts-capture.md`) | Prueba real desde el iPhone |
| B6 | Servicio resumen mensual + movimientos del mes + recategorizar | Unit con fixtures multimoneda |
| B7 | Layout `/finanzas` con nav móvil/desktop | Playwright 390/1440 |
| B8 | Pantalla Mes | Playwright con datos |
| B9 | Pantalla Movimientos + recategorizar | Recategorizar refleja en Mes |
| B10 | Botón (+) | Alta de cada tipo |
| B11 | Cierre (extraído de `LedgerFinance.tsx`) | Import ICBC sigue funcionando |
| B12 | Ajustes (cuenta en 3 campos, alias, categorías, compromisos) | Alta de cuenta simplificada |
| B13 | Limpieza de huérfanos | lint, typecheck, unit, integración, build |

## Acciones del usuario

- Generar `CAPTURE_API_KEY` y cargarla en el `.env` de producción.
- Opcional: `OPEN_EXCHANGE_RATES_APP_ID` (plan gratis) para cotizaciones automáticas; sin él se cargan manualmente.
