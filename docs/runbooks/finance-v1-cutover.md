# Runbook — corte productivo de Finance Ledger v1

Este runbook separa las acciones locales seguras de las acciones externas o destructivas. Ejecutar un paso por vez y comprobar su resultado antes de continuar.

## Estado de partida esperado

- Rama: `finanzas`.
- Implementación funcional: commit `f4da3cd`.
- Dependencias auditadas: commit `9d7a9ac`.
- `npm audit --omit=dev`: cero vulnerabilidades.
- Lint, typecheck, 44 tests unitarios y 9 de integración: verdes.
- El CI de `f4da3cd` ya validó migraciones y production build.
- Producción todavía no contiene Finance Ledger v1.

Los cambios locales de `AGENTS.md`, `app/login/page.tsx` y `app/api/auth/google/` no pertenecen al corte financiero y no deben incluirse por accidente.

## 1. Publicar la rama

Desde la raíz del repositorio local:

```bash
git push origin finanzas
```

Gate: el nuevo CI de `finanzas` debe terminar con `quality` y `dependency-audit` en verde. No continuar si falla lint, typecheck, tests, migraciones, build o audit.

## 2. Crear y verificar el backup

Desde la raíz del repositorio local, con acceso SSH y Docker disponibles:

```bash
./backup-prod.command
```

Cuando el script lo solicite, escribir exactamente:

```text
backup-orgalife-prod
```

Gate: conservar las tres rutas que imprime al terminar:

- archivo `.dump`;
- checksum `.sha256`;
- manifest `.manifest` con `scratch_restore=passed`.

No hacer merge ni reset si la restauración descartable del backup no terminó correctamente.

## 3. Merge y deploy

Crear en GitHub el PR `finanzas` → `main` y mergearlo sólo después de los gates anteriores. El push resultante a `main` dispara el deploy y ejecuta `prisma migrate deploy` al arrancar el contenedor.

Gate: el workflow de deploy debe terminar correctamente y la aplicación debe responder. Verificar antes del reset que login, Home, Board y tareas siguen funcionando.

## 4. Inspección read-only del reset

Desde la raíz del repositorio local:

```bash
./reset-finance-v1.command --check
```

Este comando sólo cuenta datos. Gate: debe informar boards y sessions, y terminar con `No data changed`.

## 5. Reset financiero

Este es el único paso destructivo. Requiere el manifest exacto producido en el paso 2:

```bash
./reset-finance-v1.command --backup-manifest /ruta/al/backup.dump.manifest
```

El script vuelve a verificar el checksum. Sólo después de revisar el warning, escribir exactamente:

```text
reset-orgalife-finance-v1
```

El allowlist elimina únicamente tablas financieras. No incluye Board, Column, Task, Subtask, Tag ni Session.

Gate inmediato: repetir `./reset-finance-v1.command --check`; los contadores financieros deben quedar en cero y boards/sessions deben conservarse.

## 6. Inicialización real

En `/finanzas`:

1. Crear grupos y cuentas reales de Argentina y Australia.
2. Cargar saldos iniciales conciliados, con fecha y moneda correctas.
3. Configurar USD como moneda base inicial.
4. Cargar o corregir el tipo de cambio sólo cuando sea necesario.

No inventar saldos para completar el onboarding. Si un saldo no está confirmado, dejar esa cuenta pendiente.

## 7. Smoke financiero

Con un resumen ICBC Visa real:

1. Subir el PDF y comprobar que queda en `DRAFT`.
2. Revisar saldo anterior, consumos, pagos/créditos, ARS, USD e impuestos excluidos.
3. Confirmar sólo si el residual es cero y ninguna línea queda en revisión.
4. Verificar que importar aumenta gasto y deuda de tarjeta, pero no reduce el banco.
5. Registrar un pago sólo si ocurrió realmente; comprobar que reduce banco y pasivo sin crear otro gasto.
6. Verificar posición confirmada, proyectada y saldos por cuenta.

Gate final: comparar los totales del cierre contra el PDF y contra el último Excel conocido. Ante cualquier diferencia, no crear ajustes de equity para ocultarla; conservar el backup y diagnosticar antes de continuar.

## Detención y recuperación

Si falla un paso previo al reset, detenerse: producción financiera aún no fue borrada.

Si falla después del reset, no cargar más movimientos ni ejecutar los scripts históricos de push/pull. Conservar el `.dump`, su checksum y manifest, y restaurar únicamente mediante un procedimiento de recuperación revisado para ese incidente.
