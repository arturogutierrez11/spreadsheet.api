import { Inject, Injectable } from '@nestjs/common';
import {
  IStockBueSheetRepository,
  STOCK_BUE_SHEET_REPOSITORY,
} from '../../../../core/adapters/repositories/sheet/IStockBueSheetRepository';
import {
  StockBueRowsPage,
  StockBueRowsPageInput,
} from '../../../../core/entities/sheet/StockBueSheetRow';

@Injectable()
export class ListStockBueRowsService {
  constructor(
    @Inject(STOCK_BUE_SHEET_REPOSITORY)
    private readonly stockBueSheetRepository: IStockBueSheetRepository,
  ) {}

  execute(input?: StockBueRowsPageInput): Promise<StockBueRowsPage> {
    return this.stockBueSheetRepository.listRows(input);
  }
}
