import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { ListPlanillaControlRowsService } from '../../../services/sheet/planillaControl/ListPlanillaControlRowsService';
import {
  PlanillaControlRowsPage,
  PlanillaControlSheetName,
} from '../../../../core/entities/sheet/PlanillaControlSheetRow';

@Controller('sheet/planilla-control')
export class PlanillaControlController {
  private readonly allowedSheetNames = new Set<PlanillaControlSheetName>([
    'MADRE',
    'TLQV',
  ]);

  constructor(
    private readonly listPlanillaControlRowsService: ListPlanillaControlRowsService,
  ) {}

  @Get(':sheetName')
  listRows(
    @Param('sheetName') sheetName: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PlanillaControlRowsPage> {
    return this.listPlanillaControlRowsService.execute({
      sheetName: this.parseSheetName(sheetName),
      page: this.optionalPositiveInteger(page, 'page'),
      pageSize: this.optionalPositiveInteger(pageSize, 'pageSize'),
    });
  }

  private parseSheetName(sheetName: string): PlanillaControlSheetName {
    const normalizedSheetName = sheetName.trim().toUpperCase();

    if (this.allowedSheetNames.has(normalizedSheetName as PlanillaControlSheetName)) {
      return normalizedSheetName as PlanillaControlSheetName;
    }

    throw new BadRequestException('sheetName must be MADRE or TLQV.');
  }

  private optionalPositiveInteger(
    value: string | undefined,
    fieldName: string,
  ): number | undefined {
    if (value === undefined || value.trim() === '') {
      return undefined;
    }

    const parsedValue = Number(value);

    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
      throw new BadRequestException(`${fieldName} must be a positive integer.`);
    }

    return parsedValue;
  }
}
