import { IPlanillaControlRepository } from '../../adapters/repositories/madre-api/IPlanillaControlRepository';
import { IUpsertSheetRowRepository } from '../../adapters/repositories/sheet/IUpsertSheetRowRepository';
import {
  SheetCellValue,
  SheetRowData,
  SheetRowUpsertResult,
} from '../../entities/sheet/SheetRow';

interface ProcessSheetOrderInput {
  data: SheetRowData;
  sheetName?: string;
}

export class ProcessSheetOrderInteractor {
  constructor(
    private readonly sheetRowRepository: IUpsertSheetRowRepository,
    private readonly planillaControlRepository: IPlanillaControlRepository,
  ) {}

  async execute(input: ProcessSheetOrderInput): Promise<SheetRowUpsertResult> {
    const keyValue = input.data.Identificador;

    if (!this.isValidKeyValue(keyValue)) {
      throw new Error('Identificador is required to insert or update an order.');
    }

    const result = await this.sheetRowRepository.upsert({
      sheetName: input.sheetName,
      keyColumn: 'Identificador',
      keyValue,
      data: input.data,
    });

    await this.planillaControlRepository.sync(result, input.data);

    return result;
  }

  private isValidKeyValue(value: SheetCellValue | undefined): value is SheetCellValue {
    return value !== undefined && value !== null && String(value).trim() !== '';
  }
}
