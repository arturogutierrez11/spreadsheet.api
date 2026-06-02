import { Inject, Injectable } from '@nestjs/common';
import {
  IUpsertSheetRowRepository,
  UPSERT_SHEET_ROW_REPOSITORY,
} from '../../../core/adapters/repositories/sheet/IUpsertSheetRowRepository';
import {
  SheetRowUpsert,
  SheetRowUpsertResult,
} from '../../../core/entities/sheet/SheetRow';

@Injectable()
export class UpsertSheetRowService {
  constructor(
    @Inject(UPSERT_SHEET_ROW_REPOSITORY)
    private readonly upsertSheetRowRepository: IUpsertSheetRowRepository,
  ) {}

  execute(input: SheetRowUpsert): Promise<SheetRowUpsertResult> {
    return this.upsertSheetRowRepository.upsert(input);
  }
}
