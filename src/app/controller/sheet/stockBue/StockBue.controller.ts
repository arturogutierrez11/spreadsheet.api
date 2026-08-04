import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ListStockBueRowsService } from '../../../services/sheet/stockBue/ListStockBueRowsService';
import {
  StockBueRowFound,
  StockBueRowsPage,
} from '../../../../core/entities/sheet/StockBueSheetRow';

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

  @Get(':tlqv')
  async findByTlqv(@Param('tlqv') tlqv: string): Promise<StockBueRowFound> {
    const normalizedTlqv = tlqv.trim();

    if (normalizedTlqv === '') {
      throw new BadRequestException('tlqv is required.');
    }

    const row = await this.listStockBueRowsService.findByTlqv(normalizedTlqv);

    if (!row) {
      throw new NotFoundException(
        `STOCK BUE row was not found for TLQV "${normalizedTlqv}".`,
      );
    }

    return row;
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
