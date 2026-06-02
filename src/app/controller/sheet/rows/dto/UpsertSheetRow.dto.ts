import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import {
  SheetCellValue,
  SheetRowData,
} from '../../../../../core/entities/sheet/SheetRow';

export class UpsertSheetRowDto {
  @IsOptional()
  @IsString()
  sheetName?: string;

  @IsString()
  @IsNotEmpty()
  keyColumn: string;

  @ValidateIf((_, value) => value !== null)
  @IsNotEmpty()
  keyValue: SheetCellValue;

  @IsObject()
  data: SheetRowData;
}
