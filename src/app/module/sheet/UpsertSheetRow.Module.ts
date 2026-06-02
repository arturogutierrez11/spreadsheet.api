import { Module } from '@nestjs/common';
import { ProcessSheetOrderController } from '../../controller/sheet/orders/ProcessSheetOrder.controller';
import { UpsertSheetRowController } from '../../controller/sheet/rows/UpsertSheetRow.controller';
import { GoogleSheetsRowRepository } from '../../driver/sheet/GoogleSheetsRowRepository';
import { ProcessSheetOrderService } from '../../services/sheet/ProcessSheetOrderService';
import { UpsertSheetRowService } from '../../services/sheet/UpsertSheetRowService';
import { UPSERT_SHEET_ROW_REPOSITORY } from '../../../core/adapters/repositories/sheet/IUpsertSheetRowRepository';

@Module({
  controllers: [ProcessSheetOrderController, UpsertSheetRowController],
  providers: [
    ProcessSheetOrderService,
    UpsertSheetRowService,
    {
      provide: UPSERT_SHEET_ROW_REPOSITORY,
      useClass: GoogleSheetsRowRepository,
    },
  ],
})
export class UpsertSheetRowModule {}
