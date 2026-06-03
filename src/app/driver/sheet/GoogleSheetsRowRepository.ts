import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';
import { IUpsertSheetRowRepository } from '../../../core/adapters/repositories/sheet/IUpsertSheetRowRepository';
import {
  SheetCellValue,
  SheetRowData,
  SheetRowAppend,
  SheetRowFindByColumn,
  SheetRowFound,
  SheetRowUpsert,
  SheetRowUpsertResult,
} from '../../../core/entities/sheet/SheetRow';

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

@Injectable()
export class GoogleSheetsRowRepository implements IUpsertSheetRowRepository {
  private readonly logger = new Logger(GoogleSheetsRowRepository.name);
  private readonly magenta = '\u001b[35m';
  private readonly resetColor = '\u001b[0m';

  private readonly legacyIdentifierMaxValue = 12815;

  private readonly protectedHeaders = new Set([
    'Id operacion',
    'Id operaciones',
    'Traduccion ID',
    'Transaccion ID',
    'Transacciones ID',
    'Notificacion de Amz',
    'ESTADO MERCADOLIBRE',
    'NROGUIAMADRE',
    'ETABUE',
    'ALERTA ETA',
    'Ezeiza',
    'ESTADO BUE',
    'STOCK BUE',
    'CANECLADA EN USA',
    'Demora USA-BA',
    '33',
  ].map((header) => this.normalizeHeader(header)));

  private readonly legacyProtectedHeaders = new Set([
    'Fecha llegada USA',
    'Fecha Salida Usa',
    'Fecha ingreso Arg',
    'Fecha Salida Arg',
  ].map((header) => this.normalizeHeader(header)));

  private readonly sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;
  private readonly defaultSheetName: string;
  private readonly googleRequestTimeoutMs = 30000;
  private readonly headersCacheTtlMs = 300000;
  private readonly rowNumberCacheTtlMs = 300000;
  private readonly maxGoogleApiAttempts = 4;
  private readonly headersCache = new Map<string, CacheEntry<string[]>>();
  private readonly rowNumberCache = new Map<string, CacheEntry<Map<string, number>>>();

  constructor(private readonly configService: ConfigService) {
    this.spreadsheetId = this.readRequiredConfig(
      'GOOGLE_SHEETS_SPREADSHEET_ID',
    );
    this.defaultSheetName = this.configService.get<string>(
      'GOOGLE_SHEETS_DEFAULT_SHEET',
      'Sheet1',
    );

    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      credentials: this.getEnvCredentials(),
    });

    this.sheets = google.sheets({ version: 'v4', auth });
  }

  async append(input: SheetRowAppend): Promise<SheetRowUpsertResult> {
    const sheetName = input.sheetName ?? this.defaultSheetName;
    const escapedSheetName = this.escapeSheetName(sheetName);
    const headers = await this.getHeaders(escapedSheetName);
    const rowNumber = await this.nextRowNumberByColumn(
      escapedSheetName,
      headers,
      'Identificador',
    );
    const updateRanges = this.mapDataToUpdateRanges(
      escapedSheetName,
      rowNumber,
      headers,
      input.data,
      input.data.Identificador,
    );

    if (updateRanges.length > 0) {
      await this.batchUpdateValues(updateRanges);
    }

    this.logPurple(
      `Google Sheets write inserted identificador=${this.normalizeCell(input.data.Identificador ?? null)} row=${rowNumber} cells=${updateRanges.length}`,
    );

    this.cacheInsertedRowNumber(escapedSheetName, headers, input.data, rowNumber);

    return { action: 'inserted', rowNumber };
  }

  async findByColumn(
    input: SheetRowFindByColumn,
  ): Promise<SheetRowFound | null> {
    const sheetName = input.sheetName ?? this.defaultSheetName;
    const escapedSheetName = this.escapeSheetName(sheetName);
    const headers = await this.getHeaders(escapedSheetName);
    const rowNumber = await this.findRowNumberByColumn(
      escapedSheetName,
      headers,
      input.keyColumn,
      input.keyValue,
    );

    if (!rowNumber) {
      return null;
    }

    const row = await this.getRow(escapedSheetName, rowNumber, headers.length);

    return {
      rowNumber,
      data: this.mapRowToData(headers, row),
    };
  }

  async upsert(input: SheetRowUpsert): Promise<SheetRowUpsertResult> {
    const sheetName = input.sheetName ?? this.defaultSheetName;
    const escapedSheetName = this.escapeSheetName(sheetName);
    const headers = await this.getHeaders(escapedSheetName);
    const rowNumber = await this.findRowNumberByColumn(
      escapedSheetName,
      headers,
      input.keyColumn,
      input.keyValue,
    );

    if (rowNumber) {
      const updateRanges = this.mapDataToUpdateRanges(
        escapedSheetName,
        rowNumber,
        headers,
        input.data,
        input.keyValue,
      );

      if (updateRanges.length > 0) {
        await this.batchUpdateValues(updateRanges);
      }

      this.logPurple(
        `Google Sheets write updated identificador=${this.normalizeCell(input.keyValue)} row=${rowNumber} cells=${updateRanges.length}`,
      );

      return { action: 'updated', rowNumber };
    }

    return this.append({ sheetName, data: input.data });
  }

  private async getHeaders(sheetName: string): Promise<string[]> {
    const cachedHeaders = this.getCachedValue(this.headersCache, sheetName);

    if (cachedHeaders) {
      return cachedHeaders;
    }

    const response = await this.withGoogleSheetsRetry(() =>
      this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A1:ZZ1`,
      }, {
        timeout: this.googleRequestTimeoutMs,
      }),
    );

    const values = (response.data.values ?? []) as SheetCellValue[][];
    const headers = values[0]?.map((value) => String(value).trim()) ?? [];

    if (headers.length === 0) {
      throw new BadRequestException(
        'The sheet must have headers in the first row before using this endpoint.',
      );
    }

    this.headersCache.set(sheetName, {
      expiresAt: Date.now() + this.headersCacheTtlMs,
      value: headers,
    });

    return headers;
  }

  private async getRow(
    sheetName: string,
    rowNumber: number,
    headerCount: number,
  ): Promise<SheetCellValue[]> {
    const response = await this.withGoogleSheetsRetry(() =>
      this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A${rowNumber}:${this.columnName(headerCount)}${rowNumber}`,
      }, {
        timeout: this.googleRequestTimeoutMs,
      }),
    );

    return ((response.data.values ?? []) as SheetCellValue[][])[0] ?? [];
  }

  private async findRowNumberByColumn(
    sheetName: string,
    headers: string[],
    keyColumn: string,
    keyValue: SheetCellValue,
  ): Promise<number | null> {
    const keyColumnIndex = headers.indexOf(keyColumn);

    if (keyColumnIndex === -1) {
      throw new BadRequestException(
        `Column "${keyColumn}" was not found in the sheet headers.`,
      );
    }

    const rowNumberByKey = await this.getRowNumberMapByColumn(
      sheetName,
      keyColumn,
      keyColumnIndex,
    );
    const rowNumber = rowNumberByKey.get(this.normalizeCell(keyValue));

    return rowNumber ?? null;
  }

  private async nextRowNumberByColumn(
    sheetName: string,
    headers: string[],
    keyColumn: string,
  ): Promise<number> {
    const keyColumnIndex = headers.indexOf(keyColumn);

    if (keyColumnIndex === -1) {
      throw new BadRequestException(
        `Column "${keyColumn}" was not found in the sheet headers.`,
      );
    }

    const rowNumberByKey = await this.getRowNumberMapByColumn(
      sheetName,
      keyColumn,
      keyColumnIndex,
    );
    const lastRowNumber = Math.max(1, ...rowNumberByKey.values());

    return lastRowNumber + 1;
  }

  private async getRowNumberMapByColumn(
    sheetName: string,
    keyColumn: string,
    keyColumnIndex: number,
  ): Promise<Map<string, number>> {
    const cacheKey = `${sheetName}:${keyColumn}`;
    const cachedRowNumberMap = this.getCachedValue(this.rowNumberCache, cacheKey);

    if (cachedRowNumberMap) {
      return cachedRowNumberMap;
    }

    const keyColumnName = this.columnName(keyColumnIndex + 1);
    const response = await this.withGoogleSheetsRetry(() =>
      this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!${keyColumnName}2:${keyColumnName}`,
      }, {
        timeout: this.googleRequestTimeoutMs,
      }),
    );
    const values = (response.data.values ?? []) as SheetCellValue[][];
    const rowNumberByKey = values.reduce<Map<string, number>>(
      (map, row, index) => {
        const key = this.normalizeCell(row[0] ?? null);

        if (key) {
          map.set(key, index + 2);
        }

        return map;
      },
      new Map<string, number>(),
    );

    this.rowNumberCache.set(cacheKey, {
      expiresAt: Date.now() + this.rowNumberCacheTtlMs,
      value: rowNumberByKey,
    });

    return rowNumberByKey;
  }

  private mapRowToData(
    headers: string[],
    row: SheetCellValue[],
  ): Record<string, SheetCellValue> {
    return headers.reduce<Record<string, SheetCellValue>>(
      (data, header, index) => {
        data[header] = row[index] ?? '';
        return data;
      },
      {},
    );
  }

  private mapDataToUpdateRanges(
    sheetName: string,
    rowNumber: number,
    headers: string[],
    data: SheetRowData,
    identifier: SheetCellValue,
    columnOffset = 0,
  ): sheets_v4.Schema$ValueRange[] {
    return headers.reduce<sheets_v4.Schema$ValueRange[]>(
      (ranges, header, index) => {
        if (this.isProtectedHeader(header, identifier)) {
          return ranges;
        }

        if (Object.prototype.hasOwnProperty.call(data, header)) {
          const columnName = this.columnName(columnOffset + index + 1);

          ranges.push({
            range: `${sheetName}!${columnName}${rowNumber}`,
            values: [[data[header] ?? '']],
          });
        }

        return ranges;
      },
      [],
    );
  }

  private async batchUpdateValues(
    data: sheets_v4.Schema$ValueRange[],
  ): Promise<void> {
    await this.withGoogleSheetsRetry(() =>
      this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data,
        },
      }, {
        timeout: this.googleRequestTimeoutMs,
      }),
    );
  }

  private isProtectedHeader(
    header: string,
    identifier: SheetCellValue | undefined,
  ): boolean {
    const normalizedHeader = this.normalizeHeader(header);

    if (this.protectedHeaders.has(normalizedHeader)) {
      return true;
    }

    return (
      this.legacyProtectedHeaders.has(normalizedHeader) &&
      this.isLegacyIdentifier(identifier)
    );
  }

  private normalizeHeader(header: string): string {
    return header
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private isLegacyIdentifier(identifier: SheetCellValue | undefined): boolean {
    if (identifier === undefined || identifier === null) {
      return false;
    }

    const match = String(identifier)
      .trim()
      .match(/^T(?:LQ|QL)V-(\d+)$/i);

    if (!match?.[1]) {
      return false;
    }

    return Number(match[1]) <= this.legacyIdentifierMaxValue;
  }

  private normalizeCell(value: SheetCellValue): string {
    return String(value ?? '').trim();
  }

  private logPurple(message: string): void {
    this.logger.log(`${this.magenta}${message}${this.resetColor}`);
  }

  private cacheInsertedRowNumber(
    sheetName: string,
    headers: string[],
    data: SheetRowData,
    rowNumber: number,
  ): void {
    if (rowNumber <= 0) {
      return;
    }

    const identifierHeader = 'Identificador';
    const identifierIndex = headers.indexOf(identifierHeader);
    const identifier = data[identifierHeader];

    if (identifierIndex === -1 || identifier === undefined) {
      return;
    }

    const cacheKey = `${sheetName}:${identifierHeader}`;
    const rowNumberByKey = this.getCachedValue(this.rowNumberCache, cacheKey);

    rowNumberByKey?.set(this.normalizeCell(identifier), rowNumber);
  }

  private getCachedValue<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
  ): T | null {
    const cachedValue = cache.get(key);

    if (!cachedValue) {
      return null;
    }

    if (cachedValue.expiresAt <= Date.now()) {
      cache.delete(key);
      return null;
    }

    return cachedValue.value;
  }

  private async withGoogleSheetsRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxGoogleApiAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (
          attempt === this.maxGoogleApiAttempts ||
          !this.isRetryableGoogleSheetsError(error)
        ) {
          throw error;
        }

        await this.sleep(this.retryDelayMs(attempt));
      }
    }

    throw lastError;
  }

  private isRetryableGoogleSheetsError(error: unknown): boolean {
    const status = this.getErrorStatus(error);

    return (
      status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504
    );
  }

  private getErrorStatus(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null) {
      return undefined;
    }

    const maybeError = error as {
      code?: unknown;
      response?: { status?: unknown };
      status?: unknown;
    };
    const status =
      maybeError.response?.status ?? maybeError.status ?? maybeError.code;

    return typeof status === 'number' ? status : undefined;
  }

  private retryDelayMs(attempt: number): number {
    return 500 * 2 ** (attempt - 1);
  }

  private sleep(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  private columnName(columnNumber: number): string {
    let dividend = columnNumber;
    let columnName = '';

    while (dividend > 0) {
      const modulo = (dividend - 1) % 26;
      columnName = String.fromCharCode(65 + modulo) + columnName;
      dividend = Math.floor((dividend - modulo) / 26);
    }

    return columnName;
  }

  private extractRowNumber(updatedRange?: string | null): number {
    const match = updatedRange?.match(/![A-Z]+(\d+):/);
    return match?.[1] ? Number(match[1]) : 0;
  }

  private escapeSheetName(sheetName: string): string {
    return `'${sheetName.replaceAll("'", "''")}'`;
  }

  private readRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);

    if (!value) {
      throw new Error(`${key} is required.`);
    }

    return value;
  }

  private getEnvCredentials():
    | Record<string, unknown>
    | { client_email: string; private_key: string }
    | undefined {
    const serviceAccountJsonBase64 = this.configService.get<string>(
      'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64',
    );

    if (serviceAccountJsonBase64) {
      return JSON.parse(
        Buffer.from(serviceAccountJsonBase64, 'base64').toString('utf8'),
      ) as Record<string, unknown>;
    }

    const clientEmail = this.configService.get<string>(
      'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    );
    const privateKey = this.configService
      .get<string>('GOOGLE_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
      return undefined;
    }

    return {
      client_email: clientEmail,
      private_key: privateKey,
    };
  }
}
