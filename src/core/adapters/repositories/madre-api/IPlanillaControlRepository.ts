import {
  SheetRowData,
  SheetRowUpsertResult,
} from '../../../entities/sheet/SheetRow';

export const PLANILLA_CONTROL_REPOSITORY = Symbol(
  'PLANILLA_CONTROL_REPOSITORY',
);

export interface IPlanillaControlRepository {
  sync(result: SheetRowUpsertResult, data: SheetRowData): Promise<void>;
}
