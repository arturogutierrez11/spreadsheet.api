import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { GetSheetOrderService } from '../../../services/sheet/GetSheetOrderService';
import { ProcessSheetOrderService } from '../../../services/sheet/ProcessSheetOrderService';
import {
  SheetRowFound,
  SheetRowUpsertResult,
} from '../../../../core/entities/sheet/SheetRow';

@Controller('sheet/orders')
export class ProcessSheetOrderController {
  constructor(
    private readonly getSheetOrderService: GetSheetOrderService,
    private readonly processSheetOrderService: ProcessSheetOrderService,
  ) {}

  @Get(':identificador')
  findByIdentificador(
    @Param('identificador') identificador: string,
  ): Promise<SheetRowFound> {
    return this.getSheetOrderService.execute(identificador);
  }

  @Post()
  process(@Body() body: Record<string, unknown>): Promise<SheetRowUpsertResult> {
    return this.processSheetOrderService.execute(body);
  }
}
