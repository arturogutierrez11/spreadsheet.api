import {
  PlanillaControlRowsPage,
  PlanillaControlRowsPageInput,
} from '../../../entities/sheet/PlanillaControlSheetRow';

export const PLANILLA_CONTROL_SHEET_REPOSITORY = Symbol(
  'PLANILLA_CONTROL_SHEET_REPOSITORY',
);

export interface IPlanillaControlSheetRepository {
  listRows(
    input: PlanillaControlRowsPageInput,
  ): Promise<PlanillaControlRowsPage>;
}
