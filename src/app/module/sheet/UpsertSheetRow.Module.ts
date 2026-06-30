import { Module } from '@nestjs/common';
import { CostosOperacionesController } from '../../controller/sheet/costosOperaciones/CostosOperaciones.controller';
import { ProcessSheetOrderController } from '../../controller/sheet/orders/ProcessSheetOrder.controller';
import { PlanillaControlController } from '../../controller/sheet/planillaControl/PlanillaControl.controller';
import { UpsertSheetRowController } from '../../controller/sheet/rows/UpsertSheetRow.controller';
import { CostosOperacionesGoogleSheetsRepository } from '../../driver/sheet/costosOperaciones/CostosOperacionesGoogleSheetsRepository';
import { GoogleSheetsRowRepository } from '../../driver/sheet/GoogleSheetsRowRepository';
import { PlanillaControlGoogleSheetsRepository } from '../../driver/sheet/planillaControl/PlanillaControlGoogleSheetsRepository';
import { SheetOrderQueue } from '../../queue/sheet/SheetOrderQueue';
import { GetSheetOrderService } from '../../services/sheet/GetSheetOrderService';
import { ListCostosOperacionesRowsService } from '../../services/sheet/costosOperaciones/ListCostosOperacionesRowsService';
import { ListPlanillaControlRowsService } from '../../services/sheet/planillaControl/ListPlanillaControlRowsService';
import { ProcessSheetOrderService } from '../../services/sheet/ProcessSheetOrderService';
import { UpsertSheetRowService } from '../../services/sheet/UpsertSheetRowService';
import { PLANILLA_CONTROL_REPOSITORY } from '../../../core/adapters/repositories/madre-api/IPlanillaControlRepository';
import { COSTOS_OPERACIONES_SHEET_REPOSITORY } from '../../../core/adapters/repositories/sheet/ICostosOperacionesSheetRepository';
import { PLANILLA_CONTROL_SHEET_REPOSITORY } from '../../../core/adapters/repositories/sheet/IPlanillaControlSheetRepository';
import { UPSERT_SHEET_ROW_REPOSITORY } from '../../../core/adapters/repositories/sheet/IUpsertSheetRowRepository';
import { PlanillaControlRepository } from '../../../core/drivers/repositories/madre-api/PlanillaControlRepository';

@Module({
  controllers: [
    CostosOperacionesController,
    PlanillaControlController,
    ProcessSheetOrderController,
    UpsertSheetRowController,
  ],
  providers: [
    GetSheetOrderService,
    ListCostosOperacionesRowsService,
    ListPlanillaControlRowsService,
    ProcessSheetOrderService,
    SheetOrderQueue,
    UpsertSheetRowService,
    {
      provide: PLANILLA_CONTROL_REPOSITORY,
      useClass: PlanillaControlRepository,
    },
    {
      provide: COSTOS_OPERACIONES_SHEET_REPOSITORY,
      useClass: CostosOperacionesGoogleSheetsRepository,
    },
    {
      provide: PLANILLA_CONTROL_SHEET_REPOSITORY,
      useClass: PlanillaControlGoogleSheetsRepository,
    },
    {
      provide: UPSERT_SHEET_ROW_REPOSITORY,
      useClass: GoogleSheetsRowRepository,
    },
  ],
})
export class UpsertSheetRowModule {}
