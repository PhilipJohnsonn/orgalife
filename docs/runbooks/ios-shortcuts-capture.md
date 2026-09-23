# Captura de gastos con Atajos de iOS

Dos atajos mandan movimientos a OrgaLife:

1. **Automatización de Wallet**: corre sola cada vez que pagás con Apple Pay.
2. **Atajo manual** (doble toque atrás): para lo que no pasa por Wallet, como la renta, pagos a personas o el sueldo.

Los dos usan el mismo endpoint y el mismo token.

> Los nombres de acciones son los de iOS en español. Si tu iPhone está en inglés: *Obtener contenido de URL* = *Get Contents of URL*, *Elegir de la lista* = *Choose from List*, *Obtener valor del diccionario* = *Get Dictionary Value*, *Formatear fecha* = *Format Date*, *Mostrar notificación* = *Show Notification*.

## 0. Preparación (una vez)

1. Generá un token largo y aleatorio. Por ejemplo, con `openssl rand -base64 32` en la Mac.
2. Cargalo como `CAPTURE_API_KEY` en el `.env` de producción y reiniciá la app. Ese token sólo abre `/api/finance/v1/quick-capture/*`; cualquier otra ruta responde 403.
3. En **Finanzas → Ajustes → Tarjetas de Apple Pay**, asociá cada tarjeta de Wallet a su cuenta. El nombre tiene que ser el mismo que muestra Wallet (ej. `Revolut` a *Revolut AUD*, `ICBC Visa` a *ICBC Visa USD*).
4. Creá tus categorías en Ajustes (Supermercado, Transporte, Renta, Salidas, …).

URL base: `https://orgalife.jensenpc.com/api/finance/v1/quick-capture`

## 1. Automatización de Wallet (Apple Pay)

**Atajos → Automatización → + → Transacción**

- Tarjetas: todas las que uses.
- Marcá **Ejecutar inmediatamente** y desactivá *Notificar al ejecutar*.

Acciones, en orden:

1. **Obtener contenido de URL**
   - URL: `…/quick-capture/options`
   - Método: GET
   - Encabezado: `Authorization` = `Bearer <TOKEN>`
2. **Obtener valor del diccionario**: clave `categoryNames` del resultado anterior.
3. **Elegir de la lista**, con la lista del paso 2 y la pregunta "¿Categoría?".
   - Si cerrás este menú, el atajo se cancela y el gasto **no** se guarda. Para no categorizar elegí "Sin categoría". Si el comercio ya tiene una regla aprendida, se categoriza solo igual.
4. **Formatear fecha**: *Fecha actual*, formato personalizado `yyyy-MM-dd'T'HH:mm`.
5. **Obtener contenido de URL**
   - URL: `…/quick-capture`
   - Método: POST
   - Encabezado: `Authorization` = `Bearer <TOKEN>`
   - Cuerpo JSON:
     - `amount` = *Entrada del atajo → Importe*
     - `merchant` = *Entrada del atajo → Comercio*
     - `card` = *Entrada del atajo → Tarjeta o pase*
     - `categoryName` = *Elemento elegido* (paso 3)
     - `occurredAt` = *Fecha formateada* (paso 4)
6. **Obtener valor del diccionario**: clave `message` del resultado.
7. **Mostrar notificación** con el valor del paso 6. Por ejemplo: `12.50 AUD · Supermercado · Revolut AUD`.

Si la respuesta trae `error` en vez de `message`, la notificación te muestra el motivo. Lo más común es una tarjeta sin asociar: "La tarjeta "X" no está asociada…".

## 2. Atajo manual (doble toque atrás)

Creá un atajo nuevo llamado "Gasto rápido":

1. **Elegir del menú** con las opciones *Gasto*, *Pago a persona* e *Ingreso*. En cada rama definí la variable `kind`:
   - Gasto y Pago a persona: `EXPENSE`
   - Ingreso: `INCOME`

   "Pago a persona" es un gasto. Por ejemplo, la renta que le pasás a tu novia va con la categoría Renta.
2. **Pedir entrada**, tipo número: "¿Monto?".
3. **Pedir entrada**, tipo texto: "¿Qué fue? / ¿A quién?".
4. **Obtener contenido de URL**, GET a `…/quick-capture/options` con el mismo encabezado de antes.
5. **Obtener valor del diccionario** `accountNames` y después **Elegir de la lista**: "¿Desde qué cuenta?".
6. **Obtener valor del diccionario** `categoryNames` del paso 4 y después **Elegir de la lista**: "¿Categoría?".
7. **Formatear fecha**, igual que en la automatización.
8. **Obtener contenido de URL**, POST a `…/quick-capture` con este cuerpo JSON:
   - `kind` = variable `kind`
   - `amount` = monto
   - `merchant` = texto del paso 3
   - `card` = cuenta elegida
   - `categoryName` = categoría elegida
   - `occurredAt` = fecha formateada
9. **Mostrar notificación** con `message`.

Para asignarlo: **Ajustes → Accesibilidad → Tocar → Toque atrás → Doble toque → Gasto rápido**.

Un sueldo australiano es un *Ingreso* con el neto que te cayó en la cuenta.

## Comportamiento del servidor

- `amount` acepta el formato que manda Wallet: `A$12.50`, `$12.50`, `12,50`. Si el importe no trae la moneda, se usa la de la cuenta.
- Tarjeta ICBC (cuenta de tarjeta): se registra como **compra provisional** en la moneda que factura la tarjeta. Una compra en AUD se convierte a USD con la última cotización cargada y se reconcilia al importar el resumen.
- Si el atajo reintenta el mismo pago dentro del mismo minuto, no se duplica.
- Si no mandás categoría y el comercio tiene una regla aprendida, se aplica sola. Las reglas se aprenden al recategorizar en **Movimientos** con "Recordar para …" activado.

## Probar sin iPhone

```bash
curl -s -X POST https://orgalife.jensenpc.com/api/finance/v1/quick-capture \
  -H "Authorization: Bearer $CAPTURE_API_KEY" -H 'content-type: application/json' \
  -d '{"amount":"A$4.50","merchant":"Prueba","card":"Revolut","categoryName":"Sin categoría","occurredAt":"2026-09-23T10:00"}'
```
