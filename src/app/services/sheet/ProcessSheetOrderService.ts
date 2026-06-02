import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  IUpsertSheetRowRepository,
  UPSERT_SHEET_ROW_REPOSITORY,
} from '../../../core/adapters/repositories/sheet/IUpsertSheetRowRepository';
import {
  SheetCellValue,
  SheetRowData,
  SheetRowUpsertResult,
} from '../../../core/entities/sheet/SheetRow';

type SheetOrderBody = Record<string, unknown>;

@Injectable()
export class ProcessSheetOrderService {
  constructor(
    @Inject(UPSERT_SHEET_ROW_REPOSITORY)
    private readonly sheetRowRepository: IUpsertSheetRowRepository,
  ) {}

  execute(body: SheetOrderBody): Promise<SheetRowUpsertResult> {
    const mode = this.normalizeMode(body.modo);
    const sheetName = this.optionalString(body.sheetName);
    const data = this.toSheetRowData(body);

    if (mode === 'append') {
      return this.sheetRowRepository.append({ sheetName, data });
    }

    const keyValue = data.Identificador;

    if (!keyValue) {
      throw new BadRequestException(
        'Identificador is required when modo is update or upsert.',
      );
    }

    return this.sheetRowRepository.upsert({
      sheetName,
      keyColumn: 'Identificador',
      keyValue,
      data,
    });
  }

  private normalizeMode(value: unknown): 'append' | 'upsert' {
    const mode = String(value ?? 'append').trim().toLowerCase();

    if (mode === 'append') {
      return 'append';
    }

    if (mode === 'update' || mode === 'upsert') {
      return 'upsert';
    }

    throw new BadRequestException(
      `modo must be "append", "update" or "upsert". Received "${mode}".`,
    );
  }

  private toSheetRowData(body: SheetOrderBody): SheetRowData {
    return Object.entries(body).reduce<SheetRowData>((data, [key, value]) => {
      if (key === 'modo' || key === 'sheetName') {
        return data;
      }

      data[key] = this.toSheetCellValue(value);
      return data;
    }, {});
  }

  private toSheetCellValue(value: unknown): SheetCellValue {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => String(item)).join(', ');
    }

    return String(value ?? '');
  }

  private optionalString(value: unknown): string | undefined {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }

    return value.trim();
  }
}
