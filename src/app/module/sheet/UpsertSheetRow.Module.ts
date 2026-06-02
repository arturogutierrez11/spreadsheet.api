import { Module } from '@nestjs/common';
import { CostosOperacionesController } from '../../controller/sheet/costosOperaciones/CostosOperaciones.controller';
import { ProcessSheetOrderController } from '../../controller/sheet/orders/ProcessSheetOrder.controller';
import { UpsertSheetRowController } from '../../controller/sheet/rows/UpsertSheetRow.controller';
import { CostosOperacionesGoogleSheetsRepository } from '../../driver/sheet/costosOperaciones/CostosOperacionesGoogleSheetsRepository';
import { GoogleSheetsRowRepository } from '../../driver/sheet/GoogleSheetsRowRepository';
import { GetSheetOrderService } from '../../services/sheet/GetSheetOrderService';
import { ListCostosOperacionesRowsService } from '../../services/sheet/costosOperaciones/ListCostosOperacionesRowsService';
import { ProcessSheetOrderService } from '../../services/sheet/ProcessSheetOrderService';
import { UpsertSheetRowService } from '../../services/sheet/UpsertSheetRowService';
import { COSTOS_OPERACIONES_SHEET_REPOSITORY } from '../../../core/adapters/repositories/sheet/ICostosOperacionesSheetRepository';
import { UPSERT_SHEET_ROW_REPOSITORY } from '../../../core/adapters/repositories/sheet/IUpsertSheetRowRepository';

@Module({
  controllers: [
    CostosOperacionesController,
    ProcessSheetOrderController,
    UpsertSheetRowController,
  ],
  providers: [
    GetSheetOrderService,
    ListCostosOperacionesRowsService,
    ProcessSheetOrderService,
    UpsertSheetRowService,
    {
      provide: COSTOS_OPERACIONES_SHEET_REPOSITORY,
      useClass: CostosOperacionesGoogleSheetsRepository,
    },
    {
      provide: UPSERT_SHEET_ROW_REPOSITORY,
      useClass: GoogleSheetsRowRepository,
    },
  ],
})
export class UpsertSheetRowModule {}
