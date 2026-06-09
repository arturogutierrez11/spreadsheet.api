import { IPlanillaControlRepository } from '../../adapters/repositories/madre-api/IPlanillaControlRepository';
import { IUpsertSheetRowRepository } from '../../adapters/repositories/sheet/IUpsertSheetRowRepository';
import { SheetOrderNotFoundError } from '../../errors/SheetOrderNotFoundError';
import { ProcessSheetOrderInteractor } from './ProcessSheetOrderInteractor';

describe('ProcessSheetOrderInteractor', () => {
  let sheetRowRepository: jest.Mocked<IUpsertSheetRowRepository>;
  let planillaControlRepository: jest.Mocked<IPlanillaControlRepository>;
  let interactor: ProcessSheetOrderInteractor;

  beforeEach(() => {
    sheetRowRepository = {
      append: jest.fn(),
      findByColumn: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    };
    planillaControlRepository = {
      sync: jest.fn(),
    };
    interactor = new ProcessSheetOrderInteractor(
      sheetRowRepository,
      planillaControlRepository,
    );
  });

  it('updates an existing row by NROVENTA without changing its Identificador', async () => {
    sheetRowRepository.findByColumn.mockResolvedValue({
      rowNumber: 25,
      data: {
        Identificador: 'TLQV-13000',
        NROVENTA: '2000016621010338',
      },
    });
    sheetRowRepository.update.mockResolvedValue({
      action: 'updated',
      rowNumber: 25,
    });

    await expect(
      interactor.execute({
        data: {
          NROVENTA: '2000016621010338',
          ESTADO: 'ENTREGADA',
        },
      }),
    ).resolves.toEqual({
      action: 'updated',
      rowNumber: 25,
    });

    expect(sheetRowRepository.update).toHaveBeenCalledWith({
      sheetName: undefined,
      keyColumn: 'NROVENTA',
      keyValue: '2000016621010338',
      protectionIdentifier: 'TLQV-13000',
      data: {
        NROVENTA: '2000016621010338',
        ESTADO: 'ENTREGADA',
      },
    });
    expect(sheetRowRepository.append).not.toHaveBeenCalled();
    expect(sheetRowRepository.upsert).not.toHaveBeenCalled();
    expect(planillaControlRepository.sync).toHaveBeenCalledWith(
      {
        action: 'updated',
        rowNumber: 25,
      },
      {
        NROVENTA: '2000016621010338',
        ESTADO: 'ENTREGADA',
        Identificador: 'TLQV-13000',
      },
    );
  });

  it('does not insert when NROVENTA does not exist', async () => {
    sheetRowRepository.findByColumn.mockResolvedValue(null);

    await expect(
      interactor.execute({
        data: {
          NROVENTA: 'ORDER-NOT-FOUND',
          ESTADO: 'ENTREGADA',
        },
      }),
    ).rejects.toBeInstanceOf(SheetOrderNotFoundError);

    expect(sheetRowRepository.update).not.toHaveBeenCalled();
    expect(sheetRowRepository.append).not.toHaveBeenCalled();
    expect(sheetRowRepository.upsert).not.toHaveBeenCalled();
    expect(planillaControlRepository.sync).not.toHaveBeenCalled();
  });

  it('keeps the existing upsert behavior when Identificador is present', async () => {
    sheetRowRepository.upsert.mockResolvedValue({
      action: 'updated',
      rowNumber: 12,
    });

    await interactor.execute({
      data: {
        Identificador: 'TLQV-13001',
        ESTADO: 'COMPRADA',
      },
    });

    expect(sheetRowRepository.upsert).toHaveBeenCalledWith({
      sheetName: undefined,
      keyColumn: 'Identificador',
      keyValue: 'TLQV-13001',
      data: {
        Identificador: 'TLQV-13001',
        ESTADO: 'COMPRADA',
      },
    });
    expect(sheetRowRepository.findByColumn).not.toHaveBeenCalled();
    expect(sheetRowRepository.update).not.toHaveBeenCalled();
  });
});
