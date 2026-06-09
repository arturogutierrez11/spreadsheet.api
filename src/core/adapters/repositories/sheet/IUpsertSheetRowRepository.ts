import {
  SheetRowAppend,
  SheetRowFindByColumn,
  SheetRowFound,
  SheetRowUpsert,
  SheetRowUpsertResult,
  SheetRowUpdate,
} from '../../../entities/sheet/SheetRow';

export const UPSERT_SHEET_ROW_REPOSITORY = Symbol(
  'UPSERT_SHEET_ROW_REPOSITORY',
);

export interface IUpsertSheetRowRepository {
  append(input: SheetRowAppend): Promise<SheetRowUpsertResult>;
  findByColumn(input: SheetRowFindByColumn): Promise<SheetRowFound | null>;
  update(input: SheetRowUpdate): Promise<SheetRowUpsertResult | null>;
  upsert(input: SheetRowUpsert): Promise<SheetRowUpsertResult>;
}
