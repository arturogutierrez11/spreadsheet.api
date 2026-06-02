import {
  CostosOperacionesRowsPage,
  CostosOperacionesRowsPageInput,
} from '../../../entities/sheet/CostosOperacionesSheetRow';

export const COSTOS_OPERACIONES_SHEET_REPOSITORY = Symbol(
  'COSTOS_OPERACIONES_SHEET_REPOSITORY',
);

export interface ICostosOperacionesSheetRepository {
  listRows(
    input?: CostosOperacionesRowsPageInput,
  ): Promise<CostosOperacionesRowsPage>;
}
