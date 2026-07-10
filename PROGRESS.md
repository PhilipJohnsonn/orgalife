# OrgaLife — Progress

## Stack

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Frontend + Backend | **Next.js (App Router)** | 16.2.4 |
| ORM | **Prisma** | 7.7.0 |
| Base de datos | **PostgreSQL** | 17 (Docker, puerto 5433) |
| UI | **Tailwind CSS + shadcn/ui** | - |
| Markdown | **react-markdown + remark-gfm** | - |
| Drag & Drop | **@hello-pangea/dnd** | - |
| Íconos | **lucide-react** | - |
| PDF parsing | **pdfjs-dist/legacy** | - |

**Nota Prisma 7:** Requiere `@prisma/adapter-pg`. No acepta `new PrismaClient()` vacío.

---

## Hecho

### Kanban
- [x] Board, columnas, tareas, subtareas, tags — CRUD completo
- [x] Drag & drop entre columnas
- [x] Filtrar tareas por tag (tabs con badges)
- [x] Board único invisible (auto-creado)
- [x] `startDate` en tareas: oculta la tarea del board hasta que llega la fecha
- [x] `isArchived` por tarea + "Archive all" en columna Done
- [x] Quick-add al pie de cada columna
- [x] Markdown en descripción de tareas (split-pane editor/preview)

### Calendario
- [x] Vista mensual y semanal (default: semana)
- [x] Tareas multi-día como cards con color, spanning columnas
- [x] CSS Grid unificado, bordes pixel-perfect
- [x] Crear tareas desde el calendario

### Home / Dashboard
- [x] Stats, mini-calendario, upcoming, overdue, unscheduled

### Infraestructura
- [x] Dark mode (localStorage)
- [x] MCP Server (18 tools, CRUD completo via REST)
- [x] Auth simple: `proxy.ts` protege todo — cookie de sesión (login con `AUTH_PASSWORD`) o header `Authorization: Bearer $MCP_API_KEY` (para API/MCP/curl)
- [x] Deploy en VPS via GitHub Actions (push main → build → restart)
- [x] Scripts `pull-db-from-prod` / `push-db-to-prod`

### Finanzas (`/finanzas`) — Rediseño completado hasta paso 5

**Modelo mental:** sin períodos fijos, todo en `Transaction`, categorías del usuario, multi-moneda.

#### Schema (migrado)
- [x] Eliminados: `FinancialPeriod`, `PeriodBalance`, `Income`, `FixedExpense`
- [x] Conservados: `FinancialAccount`, `CardStatement`, `CardExpense`, `Debt`
- [x] Nuevos: `Category`, `Transaction` (con enums `TransactionType`, `PaymentMethod`)
- [x] `Transaction` tiene FK opcional `cardExpenseId → CardExpense` (para paso 4)
- [x] `FinancialAccount.currencies String[]` — multi-moneda por cuenta (ej. Airtm: USD + EUR)

#### API
- [x] `/api/finance/accounts` — CRUD (acepta `currencies: String[]`)
- [x] `/api/finance/categories` — CRUD completo
- [x] `/api/finance/statements` — CRUD + upload PDF (sin periodId)
- [x] `/api/finance/expenses/[id]` — PATCH para toggle excluido
- [x] `/api/finance/debts` — CRUD
- [x] `/api/finance/transactions` — CRUD (GET incluye `account` y `category`, orden `date desc`)

#### UI
- [x] `FinancePage` rediseñada: tabs Categorías / Transacciones / Tarjetas / Deudas
- [x] TC (tipo de cambio ARS/USD) editable en el header, persiste en localStorage
- [x] `CategoriesList`: CRUD con color picker, edición inline
- [x] `CardStatements`: ya no depende de `FinancialPeriod`, recibe `statements[]` directo
- [x] `DebtsList`: sin cambios, funcional
- [x] Cuentas: dialog con chips multi-moneda seleccionables
- [x] Tarjetas: upload PDF → preview expenses → toggle excluidos → confirmar y guardar
- [x] PDF parser (pdfjs-dist) — soporta ICBC VISA y ICBC MASTER, extrae moneda original
- [x] **Paso 3:** `TransactionsList` — form dialog (tipo, descripción, monto, moneda, fecha, método, cuenta, categoría, recurrente) + lista con edit/delete. `amountUSD` se calcula client-side con el TC (USD directo, ARS/TC, otras monedas → null)
- [x] **Paso 4:** PDF import → `Transaction` por cada `CardExpense` no excluido (link via `cardExpenseId`):
  - Schema: `CardExpense.purchaseDate` (fecha de compra parseada del PDF) + `Transaction.cardName`
  - Parser extrae fecha por ítem (VISA `DD.MM.YY`, MASTER `DD-Mmm-YY`)
  - Transacción: `EXPENSE`/`CREDIT`, `currency`=ARS si hay `amountARS` sino USD, `amountUSD` = del PDF o `amountARS/TC` (el client manda `exchangeRate`), fecha = compra (cuotas → `dueDate` del resumen, porque el PDF trae la fecha de la compra original)
  - Dedup: al confirmar un import se borran las transacciones manuales `CREDIT` de esa tarjeta con fecha ≤ última compra del resumen (convención: gastos de tarjeta se cargan a mano solo para el día a día, el resumen las reemplaza). Form manual tiene selector de tarjeta cuando método=Crédito
  - Sync total: borrar resumen → borra sus transacciones; excluir expense → borra la suya; re-incluir → la recrea
  - Lógica compartida en `app/lib/finance.ts` (`buildTransactionData`)
  - Limitación conocida: hay PDFs de MASTER con otro layout que el parser no reconoce (0 ítems) — pre-existente
- [x] **Paso 5:** Vista principal — la tab Transacciones absorbe el rol (ahora primera y default):
  - Filtro por rango de fechas: presets (Este mes / Mes pasado / Este año / Todo) + inputs from/to custom (editar un input deselecciona el preset). Filtrado client-side (los datos ya se cargan completos en `FinancePage.load()`)
  - `BalanceSummary`: ingresos/gastos/neto por cuenta+moneda (transacciones sin cuenta → "Sin cuenta") + fila Total en USD (`amountUSD` ?? ARS/TC del header; otras monedas sin `amountUSD` quedan fuera con nota "N sin conversión")
  - Transacciones importadas de tarjeta (`cardExpenseId != null`): badge con ícono + cardName, **solo lectura** (sin edit/delete — se gestionan desde la tab Tarjetas para no romper el sync con el statement). Las CREDIT manuales siguen editables

---

## Pendiente

### Finanzas — plan de ejecución (continuar desde paso 6)
- [ ] **Paso 6:** Gráficos (ingresos vs gastos, por categoría)

### Otros
- [ ] Reordenamiento de tareas dentro de la misma columna
- [ ] Diseño responsive (mobile)
- [ ] Countdown a próximos eventos

---

## v2 — Ideas futuras

- [ ] AI: "Generar plan de acción" por tarea
- [ ] Adjuntos por tarea
- [ ] MCP: tool de búsqueda/filtro de tareas
- [ ] Integración con calendarios externos

---

## Deployment

- **Local:** `npm run dev` + Docker (`docker-compose -f docker-compose.dev.yml up -d`)
- **VPS:** `orgalife.jensenpc.com` — push a `main` deploya automático via GitHub Actions
- VPS bloquea Google outbound → usar `geist` npm package (no `next/font/google`)
- DB scripts en raíz: `pull-db-from-prod.command`, `push-db-to-prod.command`
