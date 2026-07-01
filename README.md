# Spreadsheet TLQ API

API NestJS con TypeScript y Clean Architecture para insertar o modificar filas en Google Sheets usando una service account.

## Setup

1. Crear una service account en Google Cloud y habilitar Google Sheets API.
2. Compartir el Google Sheet con el email de la service account con permisos de editor.
3. Copiar `.env.example` a `.env`.
4. Configurar `GOOGLE_SHEETS_SPREADSHEET_ID` y credenciales.

Para credenciales tenes tres opciones:

- `GOOGLE_APPLICATION_CREDENTIALS`: path al JSON local.
- `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`: JSON completo encodeado en base64, recomendado para deploy.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`: credenciales separadas por variable.

Para generar el Base64 localmente:

```bash
base64 -i service-account.json
```

## Estructura

```text
src
├── app
│   ├── app.module.ts
│   ├── controller
│   │   └── sheet
│   │       ├── orders
│   │       │   └── ProcessSheetOrder.controller.ts
│   │       └── rows
│   │           ├── UpsertSheetRow.controller.ts
│   │           └── dto
│   │               └── UpsertSheetRow.dto.ts
│   ├── driver
│   │   └── sheet
│   │       └── GoogleSheetsRowRepository.ts
│   ├── module
│   │   └── sheet
│   │       └── UpsertSheetRow.Module.ts
│   └── services
│       └── sheet
│           ├── ProcessSheetOrderService.ts
│           └── UpsertSheetRowService.ts
├── core
│   ├── adapters
│   │   └── repositories
│   │       └── sheet
│   │           └── IUpsertSheetRowRepository.ts
│   └── entities
│       └── sheet
│           └── SheetRow.ts
└── main.ts
```

`app` contiene NestJS y dependencias tecnologicas: controllers, modules, services y drivers.

`core` contiene la parte limpia: entidades e interfaces que no dependen de Google Sheets ni de NestJS.

El driver concreto de Google Sheets esta en:

```text
src/app/driver/sheet/GoogleSheetsRowRepository.ts
```

## Instalacion

```bash
npm install
npm run start:dev
```

## Endpoints

### Costos Operaciones

`GET /sheet/costos-operaciones`

Obtiene filas de la solapa configurada en `COSTOS_OPERACIONES_SHEET_NAME`, con paginado.

```bash
curl 'http://localhost:3000/sheet/costos-operaciones?page=1&pageSize=100'
```

Respuesta:

```json
{
  "page": 1,
  "pageSize": 100,
  "totalRows": 250,
  "totalPages": 3,
  "hasNextPage": true,
  "hasPreviousPage": false,
  "rows": [
    {
      "rowNumber": 2,
      "data": {
        "Concepto": "Demo",
        "Importe": 123
      }
    }
  ]
}
```

Variables nuevas:

```env
COSTOS_OPERACIONES_SPREADSHEET_ID=1S5pHKwGPRa_sS3Mc2knwennA2IhNSXDtJ3sEK_On0aM
COSTOS_OPERACIONES_SHEET_NAME=Costos Operaciones
```

`page` empieza en `1`. `pageSize` usa `100` por defecto y tiene un maximo de `500`.

### Prueba de Lectura

`GET /sheet/prueba-lectura/MADRE`

`GET /sheet/prueba-lectura/TLQV`

Obtiene filas del spreadsheet de Prueba de Lectura, con paginado. Solo acepta las solapas `MADRE` y `TLQV`.

```bash
curl 'http://localhost:3000/sheet/prueba-lectura/MADRE?page=1&pageSize=100'
curl 'http://localhost:3000/sheet/prueba-lectura/TLQV?page=1&pageSize=100'
```

Tambien permite buscar una fila por ID:

```bash
curl 'http://localhost:3000/sheet/prueba-lectura/TLQV/TLQV-1569'
curl 'http://localhost:3000/sheet/prueba-lectura/MADRE/TLQV-1569'
```

Para `TLQV`, busca por la columna `TLQV`. Para `MADRE`, busca por la columna `Identificador`.

Variable:

```env
PRUEBA_LECTURA_SPREADSHEET_ID=1b8qGXC38RE9zTE310ZzI_XZqp1z_XXDqv3Dc1OX6JrY
PRUEBA_LECTURA_MADRE_SHEET_NAME=MADRE
PRUEBA_LECTURA_TLQV_SHEET_NAME=TLQV
```

`page` empieza en `1`. `pageSize` usa `100` por defecto y tiene un maximo de `500`.

### Floxus form-urlencoded

`POST /sheet/orders`

Acepta el mismo formato que el nodo actual de Floxus y encola la escritura en BullMQ:

```bash
curl --location 'http://localhost:3000/sheet/orders' \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'Identificador=TLQV-12938' \
  --data-urlencode 'FECHAAMAZON=2026/05/28' \
  --data-urlencode 'FECHACOMPRA=2026/05/27' \
  --data-urlencode 'NROVENTA=2000016621010338' \
  --data-urlencode 'ESTADO=COMPRADA'
```

Funcionamiento:

- Se puede identificar la fila por `Identificador` o por `NROVENTA`.
- El endpoint responde `202` cuando el job queda encolado.
- El worker procesa la cola con concurrencia `1` por defecto.
- El rate limit por defecto procesa como maximo `1` job cada `1000ms`.
- Si el `Identificador` ya existe, el worker actualiza solo las columnas enviadas y conserva el resto de la fila.
- Si el `Identificador` no existe, el worker inserta una nueva fila.
- Si el body no trae `Identificador` y trae `NROVENTA`, busca una coincidencia exacta y solo actualiza esa fila.
- `NROVENTA` nunca inserta filas nuevas. Si no existe, el job falla sin reintentos.
- Si el body trae `modo` por compatibilidad con el proceso viejo, la API lo ignora.

Respuesta:

```json
{
  "jobId": "123",
  "status": "queued"
}
```

Todos los campos del body se mapean contra los headers de la primera fila del Sheet. Por ejemplo, el campo `Cantidad de Unidades` va a la columna que tenga exactamente ese header.

Campos numericos: importes, pesos, medidas y cantidades se envian a Google Sheets como numeros para que las formulas del Sheet los puedan operar correctamente. IDs como `NROVENTA`, `CUITCOMPRADOR`, `CUITENVIO` y `CODIGO POSTAL` se mantienen como texto.

Campos protegidos: aunque el body envie valores para estos headers, la API no los escribe en el Sheet. En updates conserva el valor existente de esas columnas.
En inserts tampoco manda valores vacios a esos campos, para no borrar formulas preexistentes.

```text
Id operacion
Traduccion ID
Notificacion de Amz
ESTADO MERCADOLIBRE
NROGUIAMADRE
ETABUE
ALERTA ETA
Ezeiza
ESTADO BUE
STOCK BUE
CANECLADA EN USA
Demora USA-BA
33
```

Campos protegidos solo para identificadores historicos: si `Identificador` es `TLQV-12815` o menor, la API no escribe estos campos aunque vengan en el body. Para `TLQV-12816` o mayor, si se pueden escribir.

```text
Fecha llegada USA
Fecha Salida Usa
Fecha ingreso Arg
Fecha Salida Arg
```

Para obtener una fila por `Identificador`:

```bash
curl --location 'http://localhost:3000/sheet/orders/TLQV-DOMINIO-TEST-001'
```

Respuesta:

```json
{
  "rowNumber": 2,
  "data": {
    "Identificador": "TLQV-DOMINIO-TEST-001",
    "ESTADO": "COMPRADA"
  }
}
```

### JSON tecnico

`POST /sheet/rows/upsert`

Actualiza una fila existente si encuentra `keyValue` dentro de `keyColumn`; si no la encuentra, inserta una fila nueva.

```json
{
  "sheetName": "Sheet1",
  "keyColumn": "email",
  "keyValue": "cliente@demo.com",
  "data": {
    "nombre": "Cliente Demo",
    "email": "cliente@demo.com",
    "telefono": "+5491112345678",
    "estado": "nuevo"
  }
}
```

Respuesta:

```json
{
  "action": "inserted",
  "rowNumber": 2
}
```

La primera fila del Sheet debe contener los headers. Las claves de `data` se mapean por nombre de header.

Nota de performance: para upserts por `Identificador`, el worker lee solo la fila de headers y la columna `Identificador`; no carga toda la planilla.

Cada job procesado hace insert/update en el Sheet y tambien sincroniza la tabla `planilla_control` en Madre API:

- `inserted`: `POST /api/internal/planilla-control`
- `updated`: `PATCH /api/internal/planilla-control/{id}`
- si el PATCH devuelve 404, intenta POST

Variables:

```env
MADRE_API_BASE_URL=https://api.madre.loquieroaca.com
MADRE_API_INTERNAL_API_KEY=your-internal-api-key
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# REDIS_TLS=false
# REDIS_USERNAME=default
# REDIS_PASSWORD=
SHEET_ORDER_QUEUE_CONCURRENCY=1
SHEET_ORDER_QUEUE_RATE_LIMIT_MAX=1
SHEET_ORDER_QUEUE_RATE_LIMIT_DURATION_MS=1000
SHEET_ORDER_QUEUE_ATTEMPTS=5
SHEET_ORDER_QUEUE_BACKOFF_MS=5000
```

Panel de monitoreo de la cola:

```env
BULL_BOARD_ENABLED=true
BULL_BOARD_PATH=/admin/queues
BULL_BOARD_USERNAME=admin
BULL_BOARD_PASSWORD=change-me
```

Con eso queda disponible en `/admin/queues` y pide usuario/password por Basic Auth.
# spreadsheet.api
