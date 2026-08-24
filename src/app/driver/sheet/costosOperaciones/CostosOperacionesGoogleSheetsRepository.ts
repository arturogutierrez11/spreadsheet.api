import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';
import { ICostosOperacionesSheetRepository } from '../../../../core/adapters/repositories/sheet/ICostosOperacionesSheetRepository';
import {
  CostosOperacionesCellValue,
  CostosOperacionesRowFound,
  CostosOperacionesRowsPage,
  CostosOperacionesRowsPageInput,
} from '../../../../core/entities/sheet/CostosOperacionesSheetRow';
import { SheetRowData } from '../../../../core/entities/sheet/SheetRow';

@Injectable()
export class CostosOperacionesGoogleSheetsRepository
  implements ICostosOperacionesSheetRepository
{
  private readonly sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;
  private readonly sheetName: string;
  private readonly googleRequestTimeoutMs = 30000;
  private readonly maxGoogleApiAttempts = 4;
  private readonly defaultPage = 1;
  private readonly defaultPageSize = 100;
  private readonly maxPageSize = 500;

  constructor(private readonly configService: ConfigService) {
    this.spreadsheetId = this.readRequiredConfig(
      'COSTOS_OPERACIONES_SPREADSHEET_ID',
    );
    this.sheetName = this.readRequiredConfig('COSTOS_OPERACIONES_SHEET_NAME');

    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      credentials: this.getEnvCredentials(),
    });

    this.sheets = google.sheets({ version: 'v4', auth });
  }

  async listRows(
    input: CostosOperacionesRowsPageInput = {},
  ): Promise<CostosOperacionesRowsPage> {
    const page = input.page ?? this.defaultPage;
    const pageSize = Math.min(
      input.pageSize ?? this.defaultPageSize,
      this.maxPageSize,
    );
    const response = await this.withGoogleSheetsRetry(() =>
      this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.escapeSheetName(this.sheetName)}!A:ZZ`,
      }, {
        timeout: this.googleRequestTimeoutMs,
      }),
    );
    const values = (response.data.values ?? []) as CostosOperacionesCellValue[][];
    const headers = values[0]?.map((value) => String(value).trim()) ?? [];

    if (headers.length === 0) {
      throw new BadRequestException(
        'Costos Operaciones sheet must have headers in the first row.',
      );
    }

    const rows = values.slice(1).map((row, index) => ({
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

  async findByTlqv(
    tlqv: string,
  ): Promise<CostosOperacionesRowFound | null> {
    const escapedSheetName = this.escapeSheetName(this.sheetName);
    const [headersResponse, tlqvColumnResponse] = await Promise.all([
      this.withGoogleSheetsRetry(() =>
        this.sheets.spreadsheets.values.get(
          {
            spreadsheetId: this.spreadsheetId,
            range: `${escapedSheetName}!A1:ZZ1`,
          },
          { timeout: this.googleRequestTimeoutMs },
        ),
      ),
      this.withGoogleSheetsRetry(() =>
        this.sheets.spreadsheets.values.get(
          {
            spreadsheetId: this.spreadsheetId,
            range: `${escapedSheetName}!A2:A`,
          },
          { timeout: this.googleRequestTimeoutMs },
        ),
      ),
    ]);
    const headers = (
      (headersResponse.data.values ?? [])[0] as
        | CostosOperacionesCellValue[]
        | undefined
    )?.map((value) => String(value).trim()) ?? [];

    if (headers.length === 0) {
      throw new BadRequestException(
        'Costos Operaciones sheet must have headers in the first row.',
      );
    }

    const normalizedTlqv = tlqv.trim().toUpperCase();
    const tlqvValues = (tlqvColumnResponse.data.values ?? []) as
      CostosOperacionesCellValue[][];
    const rowIndex = tlqvValues.findIndex(
      (row) => String(row[0] ?? '').trim().toUpperCase() === normalizedTlqv,
    );

    if (rowIndex === -1) {
      return null;
    }

    const rowNumber = rowIndex + 2;
    const rowResponse = await this.withGoogleSheetsRetry(() =>
      this.sheets.spreadsheets.values.get(
        {
          spreadsheetId: this.spreadsheetId,
          range: `${escapedSheetName}!A${rowNumber}:ZZ${rowNumber}`,
        },
        { timeout: this.googleRequestTimeoutMs },
      ),
    );
    const row = ((rowResponse.data.values ?? [])[0] ?? []) as
      CostosOperacionesCellValue[];

    return {
      rowNumber,
      data: this.mapRowToData(headers, row),
    };
  }

  private mapRowToData(
    headers: string[],
    row: CostosOperacionesCellValue[],
  ): SheetRowData {
    return headers.reduce<SheetRowData>((data, header, index) => {
      data[header] = row[index] ?? '';
      return data;
    }, {});
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
