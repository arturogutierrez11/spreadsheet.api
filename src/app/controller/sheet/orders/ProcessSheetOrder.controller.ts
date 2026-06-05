import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { GetSheetOrderService } from '../../../services/sheet/GetSheetOrderService';
import { ProcessSheetOrderService } from '../../../services/sheet/ProcessSheetOrderService';
import { SheetOrderQueuedResult } from '../../../queue/sheet/SheetOrderQueue';
import {
  SheetRowFound,
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
  @HttpCode(202)
  process(@Body() body: Record<string, unknown>): Promise<SheetOrderQueuedResult> {
    return this.processSheetOrderService.execute(body);
  }
}
