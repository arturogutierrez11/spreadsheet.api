export type SheetCellValue = string | number | boolean | null;

export type SheetRowData = Record<string, SheetCellValue>;

export interface SheetRowUpsert {
  sheetName?: string;
  keyColumn: string;
  keyValue: SheetCellValue;
  data: SheetRowData;
}

export interface SheetRowAppend {
  sheetName?: string;
  data: SheetRowData;
}

export interface SheetRowUpsertResult {
  action: 'inserted' | 'updated';
  rowNumber: number;
}
