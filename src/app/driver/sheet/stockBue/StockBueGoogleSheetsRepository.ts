import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';
import { IStockBueSheetRepository } from '../../../../core/adapters/repositories/sheet/IStockBueSheetRepository';
import {
  StockBueCellValue,
  StockBueRowFound,
  StockBueRowsPage,
  StockBueRowsPageInput,
} from '../../../../core/entities/sheet/StockBueSheetRow';
import { SheetRowData } from '../../../../core/entities/sheet/SheetRow';

@Injectable()
export class StockBueGoogleSheetsRepository implements IStockBueSheetRepository {
  private readonly defaultSpreadsheetId =
    '1MQeZVdIz1Q6PnJewfBBl0Z7DX3w3g6Wzaw7xjf7j9Ag';
  private readonly sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;
  private readonly sheetName: string;
  private readonly googleRequestTimeoutMs = 30000;
  private readonly maxGoogleApiAttempts = 4;
  private readonly defaultPage = 1;
  private readonly defaultPageSize = 100;
  private readonly maxPageSize = 500;

  constructor(private readonly configService: ConfigService) {
    this.spreadsheetId = this.configService.get<string>(
      'STOCK_BUE_SPREADSHEET_ID',
      this.defaultSpreadsheetId,
    );
    this.sheetName = this.configService.get<string>(
      'STOCK_BUE_SHEET_NAME',
      'STOCK BUE',
    );

    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      credentials: this.getEnvCredentials(),
    });

    this.sheets = google.sheets({ version: 'v4', auth });
  }

  async listRows(
    input: StockBueRowsPageInput = {},
  ): Promise<StockBueRowsPage> {
    const page = input.page ?? this.defaultPage;
    const pageSize = Math.min(
      input.pageSize ?? this.defaultPageSize,
      this.maxPageSize,
    );
    const { headers, rows: dataRows } = await this.readSheetData();

    const rows = dataRows.map((row, index) => ({
      rowNumber: index + 2,
      data: this.mapRowToData(headers, row),
    }));
    const totalRows = rows.length;
    const totalPages = Math.ceil(totalRows / pageSize);
    const startIndex = (page - 1) * pageSize;

    return {
      page,
      pageSize,
      totalRows,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1 && totalPages > 0,
      rows: rows.slice(startIndex, startIndex + pageSize),
    };
  }

  async findByTlqv(tlqv: string): Promise<StockBueRowFound | null> {
    const { headers, rows } = await this.readSheetData();
    const tlqvColumnIndex = headers.findIndex(
      (header) => header.toUpperCase() === 'TLQV',
    );

    if (tlqvColumnIndex === -1) {
      throw new BadRequestException(
        'STOCK BUE sheet must have a "TLQV" header.',
      );
    }

    const normalizedTlqv = tlqv.trim().toUpperCase();
    const rowIndex = rows.findIndex(
      (row) =>
        String(row[tlqvColumnIndex] ?? '').trim().toUpperCase() ===
        normalizedTlqv,
    );

    if (rowIndex === -1) {
      return null;
    }

    return {
      rowNumber: rowIndex + 2,
      data: this.mapRowToData(headers, rows[rowIndex]),
    };
  }

  private async readSheetData(): Promise<{
    headers: string[];
    rows: StockBueCellValue[][];
  }> {
    const response = await this.withGoogleSheetsRetry(() =>
      this.sheets.spreadsheets.values.get(
        {
          spreadsheetId: this.spreadsheetId,
          range: `${this.escapeSheetName(this.sheetName)}!A:ZZ`,
        },
        {
          timeout: this.googleRequestTimeoutMs,
        },
      ),
    );
    const values = (response.data.values ?? []) as StockBueCellValue[][];
    const headers = values[0]?.map((value) => String(value).trim()) ?? [];

    if (headers.length === 0) {
      throw new BadRequestException(
        'STOCK BUE sheet must have headers in the first row.',
      );
    }

    return {
      headers,
      rows: this.rowsUntilFirstEmpty(values.slice(1)),
    };
  }

  private mapRowToData(
    headers: string[],
    row: StockBueCellValue[],
  ): SheetRowData {
    return headers.reduce<SheetRowData>((data, header, index) => {
      data[header] = row[index] ?? '';
      return data;
    }, {});
  }

  private rowsUntilFirstEmpty(
    rows: StockBueCellValue[][],
  ): StockBueCellValue[][] {
    const firstEmptyRowIndex = rows.findIndex((row) =>
      this.isEffectivelyEmptyRow(row),
    );

    if (firstEmptyRowIndex === -1) {
      return rows;
    }

    return rows.slice(0, firstEmptyRowIndex);
  }

  private isEffectivelyEmptyRow(row: StockBueCellValue[]): boolean {
    return row.every((value) => this.isEmptyCellValue(value));
  }

  private isEmptyCellValue(value: StockBueCellValue | undefined): boolean {
    const normalizedValue = String(value ?? '').trim();

    return (
      normalizedValue === '' ||
      normalizedValue === '#N/A' ||
      normalizedValue === '#VALUE!' ||
      normalizedValue === '#REF!' ||
      normalizedValue === '#DIV/0!' ||
      normalizedValue === '#NAME?' ||
      normalizedValue === '#NUM!' ||
      normalizedValue === '#ERROR!'
    );
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

  private escapeSheetName(sheetName: string): string {
    return `'${sheetName.replaceAll("'", "''")}'`;
  }
}
