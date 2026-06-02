import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';
import { IUpsertSheetRowRepository } from '../../../core/adapters/repositories/sheet/IUpsertSheetRowRepository';
import {
  SheetCellValue,
  SheetRowAppend,
  SheetRowFindByColumn,
  SheetRowFound,
  SheetRowUpsert,
  SheetRowUpsertResult,
} from '../../../core/entities/sheet/SheetRow';

@Injectable()
export class GoogleSheetsRowRepository implements IUpsertSheetRowRepository {
  private readonly legacyIdentifierMaxValue = 12815;

  private readonly protectedHeaders = new Set([
    'Id operacion',
    'Traduccion ID',
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
  ]);

  private readonly legacyProtectedHeaders = new Set([
    'Fecha llegada USA',
    'Fecha Salida Usa',
    'Fecha ingreso Arg',
    'Fecha Salida Arg',
  ]);

  private readonly sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;
  private readonly defaultSheetName: string;

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
    const rows = await this.getRows(escapedSheetName);
    const headers = this.getHeaders(rows);
    const values = this.mapDataToRow(headers, input.data, input.data.Identificador);

    const appendResponse = await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${escapedSheetName}!A:${this.columnName(headers.length)}`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [values],
      },
    });

    const rowNumber = this.extractRowNumber(
      appendResponse.data.updates?.updatedRange,
    );

    return { action: 'inserted', rowNumber };
  }

  async findByColumn(
    input: SheetRowFindByColumn,
  ): Promise<SheetRowFound | null> {
    const sheetName = input.sheetName ?? this.defaultSheetName;
    const escapedSheetName = this.escapeSheetName(sheetName);
    const rows = await this.getRows(escapedSheetName);
    const headers = this.getHeaders(rows);
    const keyColumnIndex = headers.indexOf(input.keyColumn);

    if (keyColumnIndex === -1) {
      throw new BadRequestException(
        `Column "${input.keyColumn}" was not found in the sheet headers.`,
      );
    }

    const normalizedKeyValue = this.normalizeCell(input.keyValue);
    const existingRowIndex = rows
      .slice(1)
      .findIndex(
        (row) =>
          this.normalizeCell(row[keyColumnIndex] ?? null) ===
          normalizedKeyValue,
      );

    if (existingRowIndex === -1) {
      return null;
    }

    const row = rows[existingRowIndex + 1] ?? [];

    return {
      rowNumber: existingRowIndex + 2,
      data: this.mapRowToData(headers, row),
    };
  }

  async upsert(input: SheetRowUpsert): Promise<SheetRowUpsertResult> {
    const sheetName = input.sheetName ?? this.defaultSheetName;
    const escapedSheetName = this.escapeSheetName(sheetName);
    const rows = await this.getRows(escapedSheetName);
    const headers = this.getHeaders(rows);
    const keyColumnIndex = headers.indexOf(input.keyColumn);

    if (keyColumnIndex === -1) {
      throw new BadRequestException(
        `Column "${input.keyColumn}" was not found in the sheet headers.`,
      );
    }

    const normalizedKeyValue = this.normalizeCell(input.keyValue);
    const existingRowIndex = rows
      .slice(1)
      .findIndex(
        (row) =>
          this.normalizeCell(row[keyColumnIndex] ?? null) ===
          normalizedKeyValue,
      );

    if (existingRowIndex >= 0) {
      const rowNumber = existingRowIndex + 2;
      const updateRanges = this.mapDataToUpdateRanges(
        escapedSheetName,
        rowNumber,
        headers,
        input.data,
        input.keyValue,
      );

      if (updateRanges.length > 0) {
        await this.sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: updateRanges,
          },
        });
      }

      return { action: 'updated', rowNumber };
    }

    return this.append({ sheetName, data: input.data });
  }

  private async getRows(sheetName: string): Promise<SheetCellValue[][]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A:ZZ`,
    });

    return (response.data.values ?? []) as SheetCellValue[][];
  }

  private getHeaders(rows: SheetCellValue[][]): string[] {
    const headers = rows[0]?.map((value) => String(value).trim()) ?? [];

    if (headers.length === 0) {
      throw new BadRequestException(
        'The sheet must have headers in the first row before using this endpoint.',
      );
    }

    return headers;
  }

  private mapDataToRow(
    headers: string[],
    data: Record<string, SheetCellValue>,
    identifier: SheetCellValue | undefined,
  ): SheetCellValue[] {
    return headers.map((header) => {
      if (this.isProtectedHeader(header, identifier)) {
        return '';
      }

      return data[header] ?? '';
    });
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
    data: Record<string, SheetCellValue>,
    identifier: SheetCellValue,
  ): sheets_v4.Schema$ValueRange[] {
    return headers.reduce<sheets_v4.Schema$ValueRange[]>((ranges, header, index) => {
      if (this.isProtectedHeader(header, identifier)) {
        return ranges;
      }

      if (Object.prototype.hasOwnProperty.call(data, header)) {
        const columnName = this.columnName(index + 1);

        ranges.push({
          range: `${sheetName}!${columnName}${rowNumber}`,
          values: [[data[header] ?? '']],
        });
      }

      return ranges;
    }, []);
  }

  private isProtectedHeader(
    header: string,
    identifier: SheetCellValue | undefined,
  ): boolean {
    const normalizedHeader = header.trim();

    if (this.protectedHeaders.has(normalizedHeader)) {
      return true;
    }

    return (
      this.legacyProtectedHeaders.has(normalizedHeader) &&
      this.isLegacyIdentifier(identifier)
    );
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
