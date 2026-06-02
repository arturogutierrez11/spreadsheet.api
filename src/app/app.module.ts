import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UpsertSheetRowModule } from './module/sheet/UpsertSheetRow.Module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    UpsertSheetRowModule,
  ],
})
export class AppModule {}
