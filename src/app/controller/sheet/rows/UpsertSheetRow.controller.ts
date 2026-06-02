import { Body, Controller, Post } from '@nestjs/common';
import { UpsertSheetRowService } from '../../../services/sheet/UpsertSheetRowService';
import { SheetRowUpsertResult } from '../../../../core/entities/sheet/SheetRow';
import { UpsertSheetRowDto } from './dto/UpsertSheetRow.dto';

@Controller('sheet/rows')
export class UpsertSheetRowController {
  constructor(private readonly upsertSheetRowService: UpsertSheetRowService) {}

  @Post('upsert')
  upsert(@Body() dto: UpsertSheetRowDto): Promise<SheetRowUpsertResult> {
    return this.upsertSheetRowService.execute(dto);
  }
}
