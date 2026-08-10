# Implementation Plan 001: OrgaLife Finance Ledger v1

- **RFC:** [RFC 001](../rfcs/001-finance-ledger-v1.md)
- **Estado:** In progress — base local de Etapa 0 implementada; gates externos pendientes
- **Rama de trabajo:** `finanzas`
- **Producción:** no desplegar hasta completar Etapa 7 y el gate de Etapa 8
- **Datos financieros actuales:** descartables sólo mediante el reset operativo aprobado
- **Datos no financieros:** deben preservarse

## Regla de ejecución

Cada tarea tiene una salida observable y una verificación. Una tarea se marca completa sólo cuando ambas existen. Los cambios permanecen en `finanzas`; ningún paso de este plan autoriza merge, push, deploy, reset o uso de datos privados fuera del workspace.

## Estado general

| Etapa | Estado | Gate de salida |
|---|---|---|
| 0. Contratos y seguridad operativa | In progress | CI bloqueante, backup ensayado, fixtures definidos y spikes registrados |
| 1. Auth y boundary | Pending | sesiones opacas + auth negativa + bearer MCP aislado |
| 2. Ledger y cuentas | Pending | invariantes contables + saldos reconstruibles |
| 3. Transferencias y FX | Pending | siete movimientos argentinos + consolidación estable |
| 4. ICBC Visa | Pending | import, conciliación, impuestos, reversión e idempotencia |
| 5. Tarjeta y proyección | Pending | pago/reasignación sin duplicados |
| 6. Obligaciones y compromisos | Pending | parciales + suscripciones sin postings |
| 7. UI y cierre mensual | Pending | checklist E2E y comparación contra Excel |
| 8. Cutover | Pending | backup/restore, reset allowlisted y smoke productivo |

## Etapa 0 — Contratos y seguridad operativa

### E0-01 — Plan ejecutable

- **Estado:** Complete
- **Dependencias:** RFC Accepted
- **Salida:** este documento, con tareas, dependencias y gates.
- **Verificación:** cada etapa tiene criterio de salida y los pasos externos están identificados.

### E0-02 — CI bloqueante

- **Estado:** Implemented — pendiente primera ejecución en GitHub
- **Dependencias:** E0-01
- **Cambios:**
  - agregar scripts `typecheck` y `test:integration`;
  - crear workflow CI reutilizable;
  - ejecutar lint, typecheck, unit, migraciones, integración y build;
  - hacer que `deploy.yml` dependa del workflow CI;
  - dependency audit informativo separado.
- **Verificación local:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration` y `npm run build -- --webpack`. El build Turbopack queda cubierto por la primera ejecución en GitHub porque el sandbox local no permite su puerto interno.
- **Verificación remota:** un fallo del workflow llamado impide ejecutar el job `deploy`.

### E0-03 — PostgreSQL de integración

- **Estado:** Complete — verificado contra PostgreSQL 17 descartable
- **Dependencias:** E0-02
- **Salida:** smoke test contra PostgreSQL aislado después de `prisma migrate deploy`.
- **Verificación:** el test conecta, ejecuta `SELECT 1` y confirma que existen tablas de tareas y finanzas actuales.
- **Evidencia local:** 7 migraciones aplicadas y 2 smoke tests aprobados; el contenedor descartable fue eliminado al finalizar.
- **Nota:** es infraestructura inicial; los tests del ledger se agregan con cada etapa posterior.

### E0-04 — Backup real de producción

- **Estado:** Implemented — no ejecutado contra producción
- **Dependencias:** E0-01
- **Salida:** `backup-prod.command` que:
  - usa destino privado fuera del repositorio;
  - crea archivo timestamped con modo `0600`;
  - toma `pg_dump` sin detener la app;
  - genera checksum y conteos;
  - limpia socket/temporales en éxito, error o señal;
  - no borra ni restaura ninguna base.
- **Verificación local:** `bash -n backup-prod.command` y modo dry-run/config check.
- **Verificación real:** pendiente de acceso interactivo al VPS; no ejecutarla implícitamente.

### E0-05 — Endurecer sincronización destructiva

- **Estado:** Implemented — validación estática completa; operaciones destructivas no ejecutadas
- **Dependencias:** E0-04
- **Salida:**
  - `pull-db-from-prod.command` usa temporales seguros y cleanup;
  - `push-db-to-prod.command` crea/verifica backup productivo antes del `DROP`;
  - confirmaciones muestran origen y destino exactos;
  - restore fallido deja instrucciones y backup recuperable.
- **Verificación:** `bash -n` y revisión de que todo `DROP` está precedido por backup verificado.
- **Gate:** `push-db-to-prod.command` no se ejecuta durante el desarrollo de v1.

### E0-06 — Contrato de fixtures ICBC Visa

- **Estado:** Complete
- **Dependencias:** E0-01
- **Salida:** estructura y guía para:
  - PDFs privados ignorados por Git;
  - extracción local;
  - fixtures JSON anonimizados versionables;
  - expected output por versión de parser;
  - dos ciclos consecutivos para exclusiones fiscales.
- **Verificación:** `git status` nunca lista PDFs privados; el contrato cubre ARS, USD, moneda original, cuotas, impuestos, saldo anterior, pago/crédito y múltiples páginas.

### E0-07 — Obtener y anonimizar PDFs reales

- **Estado:** Complete — cuatro ciclos consecutivos inspeccionados y anonimizados
- **Dependencias:** E0-06
- **Entrada requerida:** 2–3 resúmenes ICBC Visa, idealmente meses consecutivos.
- **Salida:** fixtures anonimizados sin nombre, documento, tarjeta completa, domicilio, cuenta ni códigos identificables.
- **Verificación:** las ecuaciones cierran por moneda, los PDFs privados están ignorados y los fixtures modelan el crédito fiscal observado en el ciclo siguiente.
- **Gap explícito:** los cuatro PDFs no contienen una cuota facturada ni un cargo real de financiación; esos casos requieren otra fuente y no se infieren del bloque legal de Plan V.

### E0-08 — Spikes desde VPS

- **Estado:** Blocked — requiere acceso interactivo/credenciales
- **Dependencias:** E0-01
- **Checks read-only:**
  - DNS/TLS a `accounts.google.com`, `oauth2.googleapis.com` y JWKS;
  - redirect URI productiva basada en `PUBLIC_BASE_URL`;
  - DNS/TLS a Open Exchange Rates;
  - ausencia de secretos en output.
- **Salida:** tabla PASS/FAIL con fecha y Plan B activado si corresponde.
- **Verificación:** ninguna prueba cambia configuración o reinicia servicios.

### E0-09 — Gate de Etapa 0

- **Estado:** Pending
- **Dependencias:** E0-02 a E0-08
- **Criterio:** CI verde, backup restaurado en scratch, fixtures disponibles y spikes documentados.
- **Excepción:** si Google falla, Etapa 1 usa password endurecido temporal; si FX falla, usa snapshots manuales. Ninguno autoriza fallback inseguro.

## Etapa 1 — Auth y boundary

### E1-01 — Schemas runtime y errores comunes

- Schemas para todas las mutaciones nuevas.
- DTO monetario string y fecha civil `YYYY-MM-DD`.
- Errores `400/401/403/409/413/415/422/500` estables.
- **Verificación:** tests de payload inválido y ausencia de escrituras parciales.

### E1-02 — Sesiones opacas

- Migración aditiva `Session`.
- Token aleatorio; sólo hash persistido; expiración y revocación.
- Invalidar cookie HMAC anterior al activar.
- **Verificación:** login/logout/expiración/revocación y configuración incompleta fail-closed.

### E1-03 — Google OAuth o Plan B

- Si E0-08 pasa: OIDC validado, `PUBLIC_BASE_URL`, state/nonce/PKCE y rollout dual temporal.
- Si falla: conservar password endurecido; no decodificar tokens sin firma.
- **Verificación:** firma, issuer, audience, expiración, nonce y email permitido.

### E1-04 — Bearer MCP default-deny

- Allowlist exclusiva boards/columns/tasks/subtasks/tags.
- Rechazar UI, auth y finanzas.
- **Verificación:** bearer válido recibe `403` en `/api/finance/*`.

## Etapa 2 — Ledger y cuentas

### E2-01 — Schema aditivo del ledger

- `AccountGroup`, `LedgerAccount`, `JournalEntry`, `Posting`, categorías y auditoría mínima.
- `Decimal(18,2)` para importes; `Decimal(18,8)` para rates.
- Fecha contable `@db.Date`.
- **Verificación:** migración up sobre base vacía y copia restaurada; schema antiguo sigue legible.

### E2-02 — Motor de postings

- Operaciones atómicas e idempotentes.
- Balance por moneda y convención de signos.
- Reversal de entries confirmados.
- **Verificación:** property/table tests de balance para cada operation type.

### E2-03 — Accounts y opening balances

- Tracking `TRANSACTIONAL`/`DECLARED`.
- Opening y adjustment contra equity.
- **Verificación:** reconstrucción completa produce el mismo saldo; adjustments no alteran flujo.

### E2-04 — Ingreso y gasto

- Servicios, API y UI mínima.
- **Verificación:** banco/expense/income cuadran y errores mantienen formularios abiertos.

## Etapa 3 — Transferencias, FX y consolidación

### E3-01 — Transferencias misma moneda

- Origen/destino, negativos advertidos y auditables.
- **Verificación:** no afectan ingresos/gastos.

### E3-02 — Conversión FX

- Dos importes reales, rate efectivo y clearing por moneda.
- **Verificación:** no afecta flujo; cuentas clearing no aparecen como dinero.

### E3-03 — Cotizaciones

- Open Exchange Rates lazy, timeout/caché y override manual.
- USD pivote, snapshot/triangulación y datos incompletos visibles.
- **Verificación:** tasa efectiva de transacción nunca cambia por refresh automático.

### E3-04 — Read models regionales

- Argentina/Australia/Global.
- Posiciones confirmada/proyectada; cuentas declaradas con antigüedad.
- **Verificación:** cambiar USD→AUD modifica sólo la valuación.

## Etapa 4 — ICBC Visa

### E4-01 — Parser puro versionado

- Input PDF validado; output normalizado sin escrituras.
- **Verificación:** fixtures E0-07.

### E4-02 — Draft persistente

- Hash, revisión, líneas, totales y limpieza >30 días.
- **Verificación:** reiniciar app no pierde preview; upload no crea postings.

### E4-03 — Clasificación y conciliación fiscal

- Saldo anterior, cargos, pagos/créditos y `TaxExclusion`.
- **Verificación:** ciclos consecutivos cierran a `0,01` sin adjustment genérico.

### E4-04 — Provisionales

- Matching, `SUPERSEDED`, `DISMISSED` y many-line manual resolution.
- **Verificación:** ninguna compra queda inflando proyección sin salida.

### E4-05 — Confirm/reverse/idempotency

- Lock de draft, índice parcial, keys por línea y `REVERSE_STATEMENT`.
- **Verificación:** concurrencia, doble click, reversión y reconfirmación.

## Etapa 5 — Tarjeta y proyección

### E5-01 — Pasivos y allocations

- Pago parcial/total por moneda facturada.
- Pagos sin asignar y reasignación.
- **Verificación:** reconfirmar nunca vuelve a mover el banco.

### E5-02 — Proyección read-only

- Facturado vs. no facturado, FX necesario y remanentes.
- **Verificación:** proyectar no escribe ni reserva fondos.

## Etapa 6 — Obligaciones y compromisos

### E6-01 — Obligations subledger

- Receivable/payable por moneda y settlements parciales.
- **Verificación:** suma del submayor = saldo ledger.

### E6-02 — Category rules

- Aprendizaje sólo tras confirmación del usuario.
- **Verificación:** no altera montos ni exclusiones.

### E6-03 — Recurring commitments

- `ONCE`, `WEEKLY`, `MONTHLY`; esperado vs. real.
- **Verificación:** no crea postings; semanal mensualiza con `×52/12`.

## Etapa 7 — UI y cierre mensual

### E7-01 — Onboarding financiero

- Cuentas, monedas, regiones, tracking mode y opening balances.

### E7-02 — Dashboard

- Dinero, deuda facturada, no facturado, posiciones, obligations y antigüedad.

### E7-03 — Flujo completo

- Upload → revisión → confirmación → proyección → movimientos → pago.

### E7-04 — Gate manual

- Checklist con Playwright MCP.
- Comparación contra un Excel conocido.
- **Verificación:** resultado registrado antes de producción.

## Etapa 8 — Cutover

### E8-01 — Ensayo

- Restaurar backup productivo en scratch.
- Ejecutar migraciones, reset allowlisted y onboarding de prueba.

### E8-02 — Producción

- Backup verificado.
- Merge/deploy controlado.
- Reset financiero manual.
- Opening balances reales.
- Smoke de auth y cierre.

### E8-03 — Limpieza posterior

- Retirar password sólo si Google y recuperación administrativa están probados.
- Eliminar tablas antiguas en una release posterior separada.

## Inputs del usuario pendientes

1. Adjuntar 2–3 PDFs ICBC Visa privados, preferentemente consecutivos, después de completar E0-06.
2. Autorizar/realizar el acceso interactivo al VPS para E0-08.
3. Proporcionar saldos iniciales únicamente en E7/E8; no se necesitan para construir el ledger.
