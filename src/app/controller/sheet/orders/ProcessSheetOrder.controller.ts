import { Body, Controller, Post } from '@nestjs/common';
import { ProcessSheetOrderService } from '../../../services/sheet/ProcessSheetOrderService';
import { SheetRowUpsertResult } from '../../../../core/entities/sheet/SheetRow';

@Controller('sheet/orders')
export class ProcessSheetOrderController {
  constructor(
    private readonly processSheetOrderService: ProcessSheetOrderService,
  ) {}

  @Post()
  process(@Body() body: Record<string, unknown>): Promise<SheetRowUpsertResult> {
    return this.processSheetOrderService.execute(body);
  }
}
