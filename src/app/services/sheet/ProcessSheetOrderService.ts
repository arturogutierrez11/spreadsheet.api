import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  IPlanillaControlRepository,
  PLANILLA_CONTROL_REPOSITORY,
} from '../../../core/adapters/repositories/madre-api/IPlanillaControlRepository';
import {
  IUpsertSheetRowRepository,
  UPSERT_SHEET_ROW_REPOSITORY,
} from '../../../core/adapters/repositories/sheet/IUpsertSheetRowRepository';
import {
  SheetCellValue,
  SheetRowData,
  SheetRowUpsertResult,
} from '../../../core/entities/sheet/SheetRow';
import { ProcessSheetOrderInteractor } from '../../../core/interactor/sheet/ProcessSheetOrderInteractor';

type SheetOrderBody = Record<string, unknown>;

@Injectable()
export class ProcessSheetOrderService {
  private readonly numericFields = new Set([
    'PESOPRODUCTO',
    'Cantidad de Unidades',
    'CANTIDAD DE BULTOS',
    'PRECIOVENTA',
    'SALDOML',
    'COMISIONML',
    'COSTOENVIO',
    'Impuestos',
    'PRECIOAMAZONUSD',
    'Tipo de cambio de Automeli',
    'TIPODECAMBIOCOMPRA',
    'PESOVOLUMENTICO',
    'VALORXKG',
    'Productoco',
    'Productoco.b',
    'DIFACTURA',
    'DIFACTURA.B',
    'TEFACTURA',
    'TEFACTURA.B',
    'IVAFACTURA',
    'IVAFACTURA.B',
    'LAFACTURA',
    'LAFACTURA.B',
    'A13VENTA',
    'APORTE ML',
    'FLETEINTERNACIONALA',
    'IIFACTURA',
    'CUOTASML',
    'COM Vendedor',
    'PESOCONFIRMADO',
    'LARGOPRODUCTO',
    'ANCHOPRODUCTO',
    'ALTOPRODUCTO',
    'Demora USA-BA',
    '28',
    '29',
    '30',
    '33',
  ]);

  constructor(
    @Inject(UPSERT_SHEET_ROW_REPOSITORY)
    private readonly sheetRowRepository: IUpsertSheetRowRepository,
    @Inject(PLANILLA_CONTROL_REPOSITORY)
    private readonly planillaControlRepository: IPlanillaControlRepository,
  ) {}

  async execute(body: SheetOrderBody): Promise<SheetRowUpsertResult> {
    const sheetName = this.optionalString(body.sheetName);
    const data = this.toSheetRowData(body);
    if (!data.Identificador) {
      throw new BadRequestException(
        'Identificador is required to insert or update an order.',
      );
    }

    const interactor = new ProcessSheetOrderInteractor(
      this.sheetRowRepository,
      this.planillaControlRepository,
    );

    return interactor.execute({
      sheetName,
      data,
    });
  }

  private toSheetRowData(body: SheetOrderBody): SheetRowData {
    return Object.entries(body).reduce<SheetRowData>((data, [key, value]) => {
      if (key === 'modo' || key === 'sheetName') {
        return data;
      }

      data[key] = this.toSheetCellValue(key, value);
      return data;
    }, {});
  }

  private toSheetCellValue(key: string, value: unknown): SheetCellValue {
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => String(item)).join(', ');
    }

    const stringValue = String(value ?? '').trim();

    if (!this.numericFields.has(key) || stringValue === '') {
      return stringValue;
    }

    const normalizedNumber = Number(stringValue.replace(',', '.'));

    if (Number.isNaN(normalizedNumber)) {
      return stringValue;
    }

    return normalizedNumber;
  }

  private optionalString(value: unknown): string | undefined {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }

    return value.trim();
  }
}
