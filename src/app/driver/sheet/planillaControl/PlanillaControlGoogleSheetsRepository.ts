import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';
import { IPlanillaControlSheetRepository } from '../../../../core/adapters/repositories/sheet/IPlanillaControlSheetRepository';
import {
  PlanillaControlCellValue,
  PlanillaControlRowFindByIdInput,
  PlanillaControlRowFound,
  PlanillaControlRowsPage,
  PlanillaControlRowsPageInput,
  PlanillaControlSheetName,
} from '../../../../core/entities/sheet/PlanillaControlSheetRow';
import { SheetRowData } from '../../../../core/entities/sheet/SheetRow';

interface PlanillaControlSheetData {
  headers: string[];
  rows: PlanillaControlRowFound[];
}

@Injectable()
export class PlanillaControlGoogleSheetsRepository
  implements IPlanillaControlSheetRepository
{
  private readonly defaultSpreadsheetId =
    '1b8qGXC38RE9zTE310ZzI_XZqp1z_XXDqv3Dc1OX6JrY';
  private readonly sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;
  private readonly googleRequestTimeoutMs = 30000;
  private readonly maxGoogleApiAttempts = 4;
  private readonly defaultPage = 1;
  private readonly defaultPageSize = 100;
  private readonly maxPageSize = 500;

  constructor(private readonly configService: ConfigService) {
    this.spreadsheetId = this.configService.get<string>(
      'PLANILLA_CONTROL_SPREADSHEET_ID',
      this.defaultSpreadsheetId,
    );

    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      credentials: this.getEnvCredentials(),
    });

    this.sheets = google.sheets({ version: 'v4', auth });
  }

  async listRows(
    input: PlanillaControlRowsPageInput,
  ): Promise<PlanillaControlRowsPage> {
    const page = input.page ?? this.defaultPage;
    const pageSize = Math.min(
      input.pageSize ?? this.defaultPageSize,
      this.maxPageSize,
    );
    const { rows } = await this.readSheetData(input.sheetName);
    const totalRows = rows.length;
    const totalPages = Math.ceil(totalRows / pageSize);
    const startIndex = (page - 1) * pageSize;

    return {
      page,
      pageSize,
      sheetName: input.sheetName,
      totalRows,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1 && totalPages > 0,
      rows: rows.slice(startIndex, startIndex + pageSize),
    };
  }

  async findById(
    input: PlanillaControlRowFindByIdInput,
  ): Promise<PlanillaControlRowFound | null> {
    const { headers, rows } = await this.readSheetData(input.sheetName);
    const keyColumn = this.idColumnForSheet(input.sheetName);
    const keyColumnIndex = headers.indexOf(keyColumn);

    if (keyColumnIndex === -1) {
      throw new BadRequestException(
        `${input.sheetName} sheet must have "${keyColumn}" header.`,
      );
    }

    const normalizedId = this.normalizeCell(input.id);

    return (
      rows.find((row) => {
        const rowValue = row.data[keyColumn];

        return this.normalizeCell(rowValue) === normalizedId;
      }) ?? null
    );
  }

  private async readSheetData(
    sheetName: PlanillaControlSheetName,
  ): Promise<PlanillaControlSheetData> {
    const response = await this.withGoogleSheetsRetry(() =>
      this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.escapeSheetName(sheetName)}!A:ZZ`,
      }, {
        timeout: this.googleRequestTimeoutMs,
      }),
    );
    const values = (response.data.values ?? []) as PlanillaControlCellValue[][];
    const headers = values[0]?.map((value) => String(value).trim()) ?? [];

    if (headers.length === 0) {
      throw new BadRequestException(
        `${sheetName} sheet must have headers in the first row.`,
      );
    }

    return {
      headers,
      rows: values.slice(1).map((row, index) => ({
        rowNumber: index + 2,
        data: this.mapRowToData(headers, row),
      })),
    };
  }

  private mapRowToData(
    headers: string[],
    row: PlanillaControlCellValue[],
  ): SheetRowData {
    return headers.reduce<SheetRowData>((data, header, index) => {
      data[header] = row[index] ?? '';
      return data;
    }, {});
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

  private idColumnForSheet(sheetName: PlanillaControlSheetName): string {
    if (sheetName === 'TLQV') {
      return 'TLQV';
    }

    return 'Identificador';
  }

  private normalizeCell(value: unknown): string {
    return String(value ?? '').trim();
  }
}
