import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ListCostosOperacionesRowsService } from '../../../services/sheet/costosOperaciones/ListCostosOperacionesRowsService';
import { CostosOperacionesRowsPage } from '../../../../core/entities/sheet/CostosOperacionesSheetRow';

@Controller('sheet/costos-operaciones')
export class CostosOperacionesController {
  constructor(
    private readonly listCostosOperacionesRowsService: ListCostosOperacionesRowsService,
  ) {}

  @Get()
  listRows(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<CostosOperacionesRowsPage> {
    return this.listCostosOperacionesRowsService.execute({
      page: this.optionalPositiveInteger(page, 'page'),
      pageSize: this.optionalPositiveInteger(pageSize, 'pageSize'),
    });
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
