import { SheetCellValue, SheetRowData } from './SheetRow';

export interface CostosOperacionesRowsPageInput {
  page?: number;
  pageSize?: number;
}

export interface CostosOperacionesRowFound {
  rowNumber: number;
  data: SheetRowData;
}

export interface CostosOperacionesRowsPage {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  rows: CostosOperacionesRowFound[];
}

export type CostosOperacionesCellValue = SheetCellValue;
