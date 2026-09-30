# Pruebas de UI como en el iPhone

Dispositivo de referencia: **iPhone 17, iOS 27**. Pantalla 2622×1206 px a 460 ppi (@3x → 402×874 pt).

Verificado el 2026-09-30 con Xcode 27.0, runtime iOS 27.0 (24A434) y `@playwright/mcp` 0.0.83. Si cambia alguna versión, volver a verificar contra la herramienta local y la documentación oficial antes de confiar en este documento.

## Qué usar para qué

| Capa | Cuándo | Qué cubre | Qué no cubre |
|---|---|---|---|
| Playwright MCP (WebKit, `--device "iPhone 17"`) | Cada cambio de UI | Layout a 402×681 de viewport, escala 3, touch, flujos y clicks automatizados | No es Safari: WebKit con parches de Playwright, user agent de iOS 18.7. Sin teclado virtual, pickers nativos, zoom por foco, safe areas ni modo standalone |
| Simulador iPhone 17 en Device Hub, manejado con AXe | Formularios, teclado, `<select>`/fecha, botón +, dialogs, web app instalada | Safari real de iOS 27, toques reales y pickers nativos | Rendimiento real, Wallet/Atajos, gestos finos, DOM |
| iPhone real | Antes de cerrar algo móvil | Todo | No es automatizable |

## Playwright MCP

Configurado sólo para este proyecto (scope local en `~/.claude.json`, que tiene precedencia sobre el `playwright` de scope usuario):

```sh
claude mcp add --scope local --transport stdio playwright -- \
  npx -y @playwright/mcp@latest --browser webkit --device "iPhone 17"
```

El build de WebKit tiene que coincidir con el `playwright-core` que usa el MCP. Si falta, instalarlo con el `cli.js` de ese paquete en el caché de `npx` (`<npx-cache>/node_modules/playwright-core/cli.js install webkit`).

Login: el usuario se loguea en el navegador de Playwright; no inyectar cookies ni credenciales.

## Simulador (Device Hub)

En Xcode 27 la interfaz de simuladores es **Device Hub** (`Xcode.app/Contents/Applications/DeviceHub.app`). No hay `Simulator.app`. Se abre desde Xcode → Open Developer Tool → Device Hub. Fuente: developer.apple.com, "Managing your simulated and physical devices in Device Hub".

Requisito: `xcode-select -p` tiene que apuntar a `/Applications/Xcode.app/Contents/Developer`. Si no, `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.

Comandos verificados:

```sh
xcrun simctl list devices available | grep "iPhone 17"
xcrun simctl boot "iPhone 17"
xcrun simctl openurl booted http://localhost:3000/finanzas
xcrun simctl io booted screenshot /ruta/captura.png   # 1206×2622 nativo
```

Dentro del simulador, `localhost` es la Mac: no hace falta `--hostname 0.0.0.0`.

## Manejar el simulador con AXe

`simctl` no toca ni escribe; para eso está [AXe](https://github.com/cameroncooke/AXe) (verificado 1.8.0, 2026-09-30):

```sh
brew install cameroncooke/axe/axe
UDID=$(xcrun simctl list devices booted | grep -o -E '[0-9A-F-]{36}' | head -1)
axe tap -x 357 -y 676 --udid $UDID --post-delay 1.5    # coordenadas en puntos (402×874)
axe swipe --start-x 200 --start-y 600 --end-x 200 --end-y 250 --udid $UDID
axe type 'texto' --udid $UDID
axe describe-ui --udid $UDID --point 85,453            # elemento web en ese punto
```

- `describe-ui` sin `--point` sólo lista el chrome de Safari, no el contenido web: para ubicar elementos, capturar y escalar la captura a 402 px de ancho (`sips --resampleWidth 402`), así cada píxel es un punto de toque.
- Toca sobre la sesión de Safari existente: el usuario se loguea una vez en el simulador y AXe reusa esa cookie. No tipear credenciales con AXe.
- Tocar un `<select>` abre el picker nativo de iOS y queda en la captura.

Web Inspector: en Safari de la Mac, Settings → Advanced → "Show features for web developers". El simulador arrancado aparece en el menú Develop; en simuladores siempre está habilitado. Fuente: developer.apple.com, "Inspecting iOS".

## iPhone real

`npm run dev -- --hostname 0.0.0.0` y abrir `http://<ip-de-la-mac>:3000` en la misma red. Web Inspector requiere activarlo en el iPhone, en los ajustes avanzados de Safari (ruta exacta en iOS 27 sin verificar).

## No verificado

- `safaridriver` con `safari:useSimulator` para automatizar el Safari del simulador: documentado sólo en un blog de WebKit de 2019 y en `man safaridriver`; sin confirmación para iOS 27.
- La ruta exacta del ajuste de Web Inspector en iOS 27 físico.
