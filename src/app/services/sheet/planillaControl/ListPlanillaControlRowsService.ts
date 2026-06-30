import { Inject, Injectable } from '@nestjs/common';
import {
  IPlanillaControlSheetRepository,
  PLANILLA_CONTROL_SHEET_REPOSITORY,
} from '../../../../core/adapters/repositories/sheet/IPlanillaControlSheetRepository';
import {
  PlanillaControlRowFindByIdInput,
  PlanillaControlRowFound,
  PlanillaControlRowsPage,
  PlanillaControlRowsPageInput,
} from '../../../../core/entities/sheet/PlanillaControlSheetRow';

@Injectable()
export class ListPlanillaControlRowsService {
  constructor(
    @Inject(PLANILLA_CONTROL_SHEET_REPOSITORY)
    private readonly planillaControlSheetRepository: IPlanillaControlSheetRepository,
  ) {}

  execute(input: PlanillaControlRowsPageInput): Promise<PlanillaControlRowsPage> {
    return this.planillaControlSheetRepository.listRows(input);
  }

  findById(
    input: PlanillaControlRowFindByIdInput,
  ): Promise<PlanillaControlRowFound | null> {
    return this.planillaControlSheetRepository.findById(input);
  }
}
