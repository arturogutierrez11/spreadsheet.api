import {
  StockBueRowFound,
  StockBueRowsPage,
  StockBueRowsPageInput,
} from '../../../entities/sheet/StockBueSheetRow';

export const STOCK_BUE_SHEET_REPOSITORY = Symbol(
  'STOCK_BUE_SHEET_REPOSITORY',
);

export interface IStockBueSheetRepository {
  listRows(input?: StockBueRowsPageInput): Promise<StockBueRowsPage>;
  findByTlqv(tlqv: string): Promise<StockBueRowFound | null>;
}
