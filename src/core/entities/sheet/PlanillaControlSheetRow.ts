import { SheetCellValue, SheetRowData } from './SheetRow';

export type PlanillaControlSheetName = 'MADRE' | 'TLQV';

export interface PlanillaControlRowsPageInput {
  page?: number;
  pageSize?: number;
  sheetName: PlanillaControlSheetName;
}

export interface PlanillaControlRowFound {
  rowNumber: number;
  data: SheetRowData;
}

export interface PlanillaControlRowsPage {
  page: number;
  pageSize: number;
  sheetName: PlanillaControlSheetName;
  totalRows: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  rows: PlanillaControlRowFound[];
}

export type PlanillaControlCellValue = SheetCellValue;
