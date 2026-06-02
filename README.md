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

### Floxus form-urlencoded

`POST /sheet/orders`

Acepta el mismo formato que el nodo actual de Floxus:

```bash
curl --location 'http://localhost:3000/sheet/orders' \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'modo=append' \
  --data-urlencode 'Identificador=TLQV-12938' \
  --data-urlencode 'FECHAAMAZON=2026/05/28' \
  --data-urlencode 'FECHACOMPRA=2026/05/27' \
  --data-urlencode 'NROVENTA=2000016621010338' \
  --data-urlencode 'ESTADO=COMPRADA'
```

Funcionamiento:

- `modo=append`: inserta una nueva fila.
- `modo=update` o `modo=upsert`: busca por la columna `Identificador`; si existe actualiza solo las columnas enviadas y conserva el resto de la fila, si no existe inserta.

Todos los campos del body se mapean contra los headers de la primera fila del Sheet. Por ejemplo, el campo `Cantidad de Unidades` va a la columna que tenga exactamente ese header.

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
# spreadsheet.api
