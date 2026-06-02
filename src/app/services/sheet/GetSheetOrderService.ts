import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  IUpsertSheetRowRepository,
  UPSERT_SHEET_ROW_REPOSITORY,
} from '../../../core/adapters/repositories/sheet/IUpsertSheetRowRepository';
import { SheetRowFound } from '../../../core/entities/sheet/SheetRow';

@Injectable()
export class GetSheetOrderService {
  constructor(
    @Inject(UPSERT_SHEET_ROW_REPOSITORY)
    private readonly sheetRowRepository: IUpsertSheetRowRepository,
  ) {}

  async execute(identificador: string): Promise<SheetRowFound> {
    const row = await this.sheetRowRepository.findByColumn({
      keyColumn: 'Identificador',
      keyValue: identificador,
    });

    if (!row) {
      throw new NotFoundException(
        `Order with Identificador "${identificador}" was not found.`,
      );
    }

    return row;
  }
}
