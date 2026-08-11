# OrgaLife — Progress

## Stack

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Frontend + Backend | **Next.js (App Router)** | 16.3.0 |
| ORM | **Prisma** | 7.9.1 |
| Base de datos | **PostgreSQL** | 17 (Docker, puerto 5433) |
| UI | **Tailwind CSS + shadcn/ui** | - |
| Markdown | **react-markdown + remark-gfm** | - |
| Drag & Drop | **@hello-pangea/dnd** | - |
| Íconos | **lucide-react** | - |
| PDF parsing | **pdfjs-dist/legacy** | - |
| Gráficos | **recharts** | 3.9 |

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

### Finanzas (`/finanzas`) — Finance Ledger v1

**Fuente de verdad:** ledger de doble entrada. La especificación y el estado por etapa viven en `docs/rfcs/001-finance-ledger-v1.md`.

- [x] Cuentas y saldos iniciales en múltiples monedas/regiones.
- [x] Ingresos, gastos, ajustes, transferencias y conversiones FX atómicas.
- [x] Balance por cuenta, moneda, región y posición global confirmada/proyectada.
- [x] Importación ICBC Visa como draft revisable, idempotente y versionado.
- [x] Clasificación de consumos, pagos, créditos e impuestos excluibles.
- [x] Confirmación y reversión de resumen sin duplicar movimientos.
- [x] Compras manuales de tarjeta como provisionales conciliables.
- [x] Deuda facturada/no facturada, proyección de pago y faltante de USD/ARS.
- [x] Pago de tarjeta por moneda, allocations parciales y reasignación de pagos existentes.
- [x] Préstamos y deudas simples con cancelaciones parciales.
- [x] Categorías y reglas determinísticas aprendidas por el usuario.
- [x] Compromisos informativos únicos, semanales y mensuales vinculables a consumos reales.
- [x] UI financiera única y responsive para el flujo mensual.
- [x] CI, migraciones aditivas, backup restaurable y reset financiero allowlisted.
- [ ] Corte productivo: backup final, deploy, reset, saldos iniciales reales y smoke test.

---

## Pendiente

### Otros
- [x] Reordenamiento de tareas dentro de la misma columna
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
