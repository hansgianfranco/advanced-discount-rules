# Advanced Discount Rules - Shopify App

## Descripción

App de Shopify Functions (extension-only) que aplica descuentos automáticos tipo 3x1 en el carrito de compras. Actualmente configurada para productos con `productType = "curso virtual"`.

## Estructura del Proyecto

```
advanced-discount-rules/
├── shopify.app.toml          # Config global de la app Shopify
├── package.json              # Scripts: build, dev, deploy
├── web/                      # Servidor web con UI (Express + React + Polaris)
│   ├── package.json
│   ├── server/
│   │   └── index.js          # Express server: OAuth, API descuentos
│   ├── frontend/
│   │   ├── index.html
│   │   ├── main.jsx
│   │   └── pages/
│   │       └── Dashboard.jsx  # UI con Polaris (resumen, listado, cómo funciona)
│   └── vite.config.js
├── extensions/
│   └── promo-3x1/
│       ├── shopify.extension.toml   # Config de la función
│       ├── package.json             # Dependencias: @shopify/shopify_function
│       ├── src/
│       │   ├── index.ts             # Re-export de run.ts
│       │   ├── run.ts               # Lógica principal del descuento 3x1
│       │   └── run.graphql          # Query de input para Shopify
│       ├── generated/api.ts         # Types generados (codegen)
│       ├── locales/en.default.json  # Traducciones
│       ├── tests/
│       │   ├── run.test.ts          # Tests unitarios (vitest)
│       │   └── default.test.js      # Test de integración
│       ├── schema.graphql           # Schema de la función
│       ├── dist/function.wasm       # Build output (WebAssembly)
│       └── vitest.config.js
└── .graphqlrc.js                   # Codegen config
```

## Configuración

### shopify.app.toml
- **Client ID**: `50204c05fb0af49d92c69c48c4636e09`
- **App ID interna Shopify**: `341303132161` (referenciada en errores de API)
- **API version**: `2026-07`
- **Access scopes**: `write_discounts`
- **Dev store**: `dev-icip.myshopify.com`

### shopify.extension.toml
- **Handle**: `promo-3x1`
- **API version**: `2026-04`
- **Target**: `purchase.product-discount.run`
- **UID**: `22d67ace-b0ab-85bd-6582-87e46638cccf7204f73b`
- **Build output**: `dist/function.wasm`

## Comandos

| Comando | Descripción |
|---------|-------------|
| `npm run build` | Build de toda la app (`shopify app build`) |
| `npm run dev` | Dev server + tunnel Shopify |
| `npm run dev:web` | Servidor web UI (Express, puerto 3000) |
| `npm run deploy` | Deploy a Shopify (`shopify app deploy`) |
| `npm test` (en `extensions/promo-3x1/`) | Tests con vitest |
| `shopify store execute` | GraphQL queries contra la tienda |
| `shopify store auth` | Autenticar CLI contra una tienda |
| `shopify app versions list` | Listar versiones desplegadas |

## Lógica del Descuento (3x1)

### Cómo funciona

1. Obtiene todas las líneas del carrito
2. Filtra solo productos con `productType === "curso virtual"` (exacto, case-insensitive)
3. Expande cantidades: si un item tiene quantity=3, se crean 3 entries individuales
4. Calcula `getEffectiveUnitPrice()` que considera `discountAllocations` previos (descuentos de catálogo/terceros)
5. Ordena todos los items por precio efectivo **ascendente**
6. Agrupa en **tríos**: grupos de 3 items consecutivos
7. El item **más barato de cada trío** (índice 0, 3, 6, 9...) recibe 100% de descuento
8. freeCount = `Math.floor(totalItems / 3)`

### Ejemplo

Items: [325, 500, 585, 920] → ordenados: [325, 500, 585, 920]
- Trío 1 (idx 0,1,2): 325 gratis, 500 y 585 pagan
- Index 3 (920) no forma trío completo → paga
- Resultado: 1 descuento de 100% en line-4 (325)

Items: [100, 200, 300, 400, 500, 600]
- Trío 1 (idx 0,1,2): 100 gratis
- Trío 2 (idx 3,4,5): 400 gratis
- Resultado: 2 descuentos

### Detalles técnicos

- `PROMO_MESSAGE`: "Promoción 3x1 (Gratis el de menor precio)"
- Todos los descuentos son **100%** (gratis)
- `DiscountApplicationStrategy.First` - aplica solo el primer descuento que cumple condiciones
- `console.error()` usado para logs de depuración (se ven en Shopify Functions logs)

## Deploy y Versiones

- **Versiones actuales**: v12 (activa), v1-v11 (inactivas)
- **Store**: `ernm4z-cw.myshopify.com` (Instituto Científico del Pacífico)
- **App URL en admin**: `https://admin.shopify.com/store/ernm4z-cw/apps/advanced-discount-rules-2`
- **Developer Dashboard**: `https://dev.shopify.com/dashboard/172018912/apps/365763198977/versions`
- **Descuento 3x1 creado**: `gid://shopify/DiscountAutomaticNode/1386404544625` (vía API con OAuth)

### Notas sobre deploy

- Usar `npm run deploy -- --allow-updates` en entornos no interactivos
- El CLI requiere autenticación OAuth en browser la primera vez
- La app es "extension-only" + servidor web UI en `web/`
- Para desarrollo local de la UI: `npm run dev:web` (Express en puerto 3000)

## API GraphQL (Admin)

Para crear descuentos automáticos que usan esta función:

```graphql
mutation {
  discountAutomaticAppCreate(
    automaticAppDiscount: {
      title: "3x1 Cursos Virtuales"
      functionHandle: "promo-3x1"
      combinesWith: {
        orderDiscounts: false
        productDiscounts: true
        shippingDiscounts: false
      }
      startsAt: "2026-07-01T00:00:00Z"
    }
  ) {
    automaticAppDiscount {
      discountId
      title
    }
    userErrors {
      field
      message
    }
  }
}
```

## Problemas Conocidos

### La función no se encuentra al crear descuento (functionHandle no encontrado)
- El `functionHandle` en la API 2026-07 reemplazó al antiguo `functionId`
- La app está desplegada pero la función `promo-3x1` no aparece como disponible
- Posible causa: la tienda necesita aceptar/actualizar la versión 9 de la app
- Solución alternativa: verificar desde el admin de Shopify que la app esté usando la última versión
- `[extensions.ui.paths]` está configurado pero la app no tiene UI → redirige a página placeholder

### API no crea descuentos con CLI Connector
- `shopify store execute` usa el token del CLI Connector, no del app
- Para crear descuentos vía API se necesita el token de la app (obtenido con OAuth + client_secret)
- Script de referencia en `/tmp/oauth-discount.mjs`

### Tests
- 13 tests unitarios (vitest) + 1 test de integración
- Todos pasan antes del build/deploy

## Créditos

- **Autor**: Franco Caballero (hansgianfranco)
- **Email**: hansgianfranco@users.noreply.github.com
- **GitHub**: https://github.com/hansgianfranco
