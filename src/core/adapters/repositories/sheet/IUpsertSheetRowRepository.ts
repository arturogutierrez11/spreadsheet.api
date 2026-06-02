import {
  SheetRowAppend,
  SheetRowUpsert,
  SheetRowUpsertResult,
} from '../../../entities/sheet/SheetRow';

export const UPSERT_SHEET_ROW_REPOSITORY = Symbol(
  'UPSERT_SHEET_ROW_REPOSITORY',
);

export interface IUpsertSheetRowRepository {
  append(input: SheetRowAppend): Promise<SheetRowUpsertResult>;
  upsert(input: SheetRowUpsert): Promise<SheetRowUpsertResult>;
}
