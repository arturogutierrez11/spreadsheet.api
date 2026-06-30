import {
  PlanillaControlRowFindByIdInput,
  PlanillaControlRowFound,
  PlanillaControlRowsPage,
  PlanillaControlRowsPageInput,
} from '../../../entities/sheet/PlanillaControlSheetRow';

export const PLANILLA_CONTROL_SHEET_REPOSITORY = Symbol(
  'PLANILLA_CONTROL_SHEET_REPOSITORY',
);

export interface IPlanillaControlSheetRepository {
  findById(
    input: PlanillaControlRowFindByIdInput,
  ): Promise<PlanillaControlRowFound | null>;
  listRows(
    input: PlanillaControlRowsPageInput,
  ): Promise<PlanillaControlRowsPage>;
}
