<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# OrgaLife

App personal: tareas (kanban), calendario y finanzas. UI en español rioplatense (voseo).

## Stack

- Next.js 16 (App Router, `proxy.ts` en lugar de middleware), React 19, Tailwind 4, shadcn/ui (`components/ui`), lucide-react.
- Prisma 7 con `@prisma/adapter-pg`; `prisma`, `@prisma/client` y `@prisma/adapter-pg` van siempre en la misma versión. Cliente generado en `app/generated/prisma` (no versionado).
- PostgreSQL 17. Local: `docker compose -f docker-compose.dev.yml up -d` (contenedor `orgalife-db`, puerto 5433, datos en `./data`).
- MCP server propio en `mcp-server/` (tools de tareas vía REST).

## Comandos

- `npm run dev` — dev server.
- `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`.
- `npm run test:integration` — requiere `DATABASE_URL` (en local: cargar `.env`).
- `npx prisma migrate dev --name <nombre>` y `npx prisma generate`. Migraciones aditivas; producción aplica `migrate deploy`.
- `npm audit --omit=dev` corre en CI y debe dar 0; parchear con `overrides` antes que bajar versiones mayores.

## Convenciones

- Tests unitarios en `app/lib/*.test.mjs` con `node:test`, importando `./modulo.ts` directo. Node no resuelve `@/`: la lógica testeable va en módulos puros sin imports `@/` (ej. `finance-month.ts`, `finance-v1-contracts.ts`).
- Route handlers: `params` es una `Promise`. Errores de API con forma `{ error: { code, message } }`.
- ESLint activa `react-hooks/set-state-in-effect`.
- Finanzas UI: `app/components/finance/ux` (Mes, Movimientos, botón +), `cierre/` y `ajustes/`. Formularios de alta y edición en `Dialog`; labels de botones fijos.
- Selects dentro de sheets/dialogs móviles: `<select>` nativo.

## Auth

- `proxy.ts`: cookie de sesión (login con `AUTH_PASSWORD`) o bearer.
- `MCP_API_KEY`: sólo rutas de tareas (`/api/boards|columns|tasks|subtasks|tags`).
- `CAPTURE_API_KEY`: sólo `/api/finance/v1/quick-capture/*` (atajos de iOS, ver `docs/runbooks/ios-shortcuts-capture.md`).

## Invariantes de finanzas

Especificación: `docs/rfcs/001-finance-ledger-v1.md`.

- El ledger de doble entrada es la fuente de verdad. Transferencias, FX y pagos de tarjeta no son gastos.
- ICBC Visa se paga por moneda facturada (USD con USD, ARS con ARS). Una compra con tarjeta capturada se registra como provisional en la moneda facturada y se reconcilia al importar el resumen.
- Impuestos elegibles de consumos USD se excluyen cuando el saldo USD se cancela con USD.
- Suscripciones/compromisos son informativos: no crean movimientos.
- No inventar saldos ni usar ajustes contra equity para ocultar diferencias. Rendimientos se registran como ingreso "Rendimientos" vía "Actualizar saldo".
- Cuentas usadas se archivan (saldo 0), no se borran.
- Resumen mensual excluye entries `SUPERSEDED`, `DISMISSED`, `REVERSED` y `REVERSAL`.

## Deploy y producción

- `orgalife.jensenpc.com`. Push a `main` despliega automático (GitHub Actions → SSH → `docker compose up -d --build`). Pushear sólo con pedido explícito.
- Variables de producción en `~/orgalife/.env` del VPS (`env_file`).
- El VPS bloquea salida a Google: usar el paquete `geist`, no `next/font/google`.
- SSH y operaciones productivas manuales las ejecuta el usuario, un paso por vez.
