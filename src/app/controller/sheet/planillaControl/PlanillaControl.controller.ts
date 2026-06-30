import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ListPlanillaControlRowsService } from '../../../services/sheet/planillaControl/ListPlanillaControlRowsService';
import {
  PlanillaControlRowFound,
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

  @Get(':sheetName/:id')
  async findById(
    @Param('sheetName') sheetName: string,
    @Param('id') id: string,
  ): Promise<PlanillaControlRowFound> {
    const parsedSheetName = this.parseSheetName(sheetName);
    const row = await this.listPlanillaControlRowsService.findById({
      sheetName: parsedSheetName,
      id: this.parseId(id),
    });

    if (!row) {
      throw new NotFoundException(
        `${parsedSheetName} row was not found for id "${id}".`,
      );
    }

    return row;
  }

  private parseSheetName(sheetName: string): PlanillaControlSheetName {
    const normalizedSheetName = sheetName.trim().toUpperCase();

    if (this.allowedSheetNames.has(normalizedSheetName as PlanillaControlSheetName)) {
      return normalizedSheetName as PlanillaControlSheetName;
    }

    throw new BadRequestException('sheetName must be MADRE or TLQV.');
  }

  private parseId(id: string): string {
    const normalizedId = id.trim();

    if (normalizedId === '') {
      throw new BadRequestException('id is required.');
    }

    return normalizedId;
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
