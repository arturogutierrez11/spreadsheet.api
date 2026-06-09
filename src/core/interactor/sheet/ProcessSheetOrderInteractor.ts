import { IPlanillaControlRepository } from '../../adapters/repositories/madre-api/IPlanillaControlRepository';
import { IUpsertSheetRowRepository } from '../../adapters/repositories/sheet/IUpsertSheetRowRepository';
import {
  SheetCellValue,
  SheetRowData,
  SheetRowUpsertResult,
} from '../../entities/sheet/SheetRow';
import { SheetOrderNotFoundError } from '../../errors/SheetOrderNotFoundError';

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
    const identifier = input.data.Identificador;

    if (this.isValidKeyValue(identifier)) {
      return this.upsertByIdentifier(input, identifier);
    }

    const saleNumber = input.data.NROVENTA;

    if (this.isValidKeyValue(saleNumber)) {
      return this.updateBySaleNumber(input, saleNumber);
    }

    throw new Error(
      'Identificador or NROVENTA is required to process an order.',
    );
  }

  private async upsertByIdentifier(
    input: ProcessSheetOrderInput,
    identifier: SheetCellValue,
  ): Promise<SheetRowUpsertResult> {
    const result = await this.sheetRowRepository.upsert({
      sheetName: input.sheetName,
      keyColumn: 'Identificador',
      keyValue: identifier,
      data: input.data,
    });

    await this.planillaControlRepository.sync(result, input.data);

    return result;
  }

  private async updateBySaleNumber(
    input: ProcessSheetOrderInput,
    saleNumber: SheetCellValue,
  ): Promise<SheetRowUpsertResult> {
    const existingRow = await this.sheetRowRepository.findByColumn({
      sheetName: input.sheetName,
      keyColumn: 'NROVENTA',
      keyValue: saleNumber,
    });

    if (!existingRow) {
      throw new SheetOrderNotFoundError('NROVENTA', String(saleNumber));
    }

    const identifier = existingRow.data.Identificador;

    if (!this.isValidKeyValue(identifier)) {
      throw new Error(
        `The row with NROVENTA="${String(saleNumber)}" has no Identificador.`,
      );
    }

    const updateData = { ...input.data };
    delete updateData.Identificador;

    const result = await this.sheetRowRepository.update({
      sheetName: input.sheetName,
      keyColumn: 'NROVENTA',
      keyValue: saleNumber,
      protectionIdentifier: identifier,
      data: updateData,
    });

    if (!result) {
      throw new SheetOrderNotFoundError('NROVENTA', String(saleNumber));
    }

    await this.planillaControlRepository.sync(result, {
      ...updateData,
      Identificador: identifier,
    });

    return result;
  }

  private isValidKeyValue(value: SheetCellValue | undefined): value is SheetCellValue {
    return value !== undefined && value !== null && String(value).trim() !== '';
  }
}
