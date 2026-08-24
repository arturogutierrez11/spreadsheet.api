import { Inject, Injectable } from '@nestjs/common';
import {
  COSTOS_OPERACIONES_SHEET_REPOSITORY,
  ICostosOperacionesSheetRepository,
} from '../../../../core/adapters/repositories/sheet/ICostosOperacionesSheetRepository';
import {
  CostosOperacionesRowFound,
  CostosOperacionesRowsPage,
  CostosOperacionesRowsPageInput,
} from '../../../../core/entities/sheet/CostosOperacionesSheetRow';

@Injectable()
export class ListCostosOperacionesRowsService {
  constructor(
    @Inject(COSTOS_OPERACIONES_SHEET_REPOSITORY)
    private readonly costosOperacionesSheetRepository: ICostosOperacionesSheetRepository,
  ) {}

  execute(
    input?: CostosOperacionesRowsPageInput,
  ): Promise<CostosOperacionesRowsPage> {
    return this.costosOperacionesSheetRepository.listRows(input);
  }

  findByTlqv(tlqv: string): Promise<CostosOperacionesRowFound | null> {
    return this.costosOperacionesSheetRepository.findByTlqv(tlqv);
  }
}
