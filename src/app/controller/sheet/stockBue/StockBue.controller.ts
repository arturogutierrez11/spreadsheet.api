import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ListStockBueRowsService } from '../../../services/sheet/stockBue/ListStockBueRowsService';
import { StockBueRowsPage } from '../../../../core/entities/sheet/StockBueSheetRow';

@Controller('sheet/stock-bue')
export class StockBueController {
  constructor(private readonly listStockBueRowsService: ListStockBueRowsService) {}

  @Get()
  listRows(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<StockBueRowsPage> {
    return this.listStockBueRowsService.execute({
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
