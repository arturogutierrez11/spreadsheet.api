import { SheetCellValue, SheetRowData } from './SheetRow';

export interface StockBueRowsPageInput {
  page?: number;
  pageSize?: number;
}

export interface StockBueRowFound {
  rowNumber: number;
  data: SheetRowData;
}

export interface StockBueRowsPage {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  rows: StockBueRowFound[];
}

export type StockBueCellValue = SheetCellValue;
