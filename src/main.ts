import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { NextFunction, Request, Response } from 'express';
import { AppModule } from './app/app.module';
import { SheetOrderQueue } from './app/queue/sheet/SheetOrderQueue';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  setupBullBoard(app, configService);

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}

function setupBullBoard(
  app: Awaited<ReturnType<typeof NestFactory.create>>,
  configService: ConfigService,
): void {
  if (!booleanConfig(configService, 'BULL_BOARD_ENABLED', false)) {
    return;
  }

  const path = configService.get<string>('BULL_BOARD_PATH', '/admin/queues');
  const username = configService.get<string>('BULL_BOARD_USERNAME');
  const password = configService.get<string>('BULL_BOARD_PASSWORD');

  if (!username || !password) {
    throw new Error(
      'BULL_BOARD_USERNAME and BULL_BOARD_PASSWORD are required when BULL_BOARD_ENABLED=true.',
    );
  }

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(path);

  const sheetOrderQueue = app.get(SheetOrderQueue, { strict: false });

  createBullBoard({
    queues: [new BullMQAdapter(sheetOrderQueue.getQueue())],
    serverAdapter,
  });

  app.use(path, basicAuth(username, password), serverAdapter.getRouter());
}

function basicAuth(username: string, password: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const authorization = request.headers.authorization;
    const expected = `Basic ${Buffer.from(`${username}:${password}`).toString(
      'base64',
    )}`;

    if (authorization === expected) {
      next();
      return;
    }

    response.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
    response.status(401).send('Authentication required.');
  };
}

function booleanConfig(
  configService: ConfigService,
  key: string,
  defaultValue: boolean,
): boolean {
  const value = configService.get<string | boolean>(key);

  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return ['true', '1', 'yes', 'y'].includes(value.toLowerCase());
}

void bootstrap();
