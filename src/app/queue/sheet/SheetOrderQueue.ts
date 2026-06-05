import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectionOptions, Job, JobsOptions, Queue, Worker } from 'bullmq';
import {
  IPlanillaControlRepository,
  PLANILLA_CONTROL_REPOSITORY,
} from '../../../core/adapters/repositories/madre-api/IPlanillaControlRepository';
import {
  IUpsertSheetRowRepository,
  UPSERT_SHEET_ROW_REPOSITORY,
} from '../../../core/adapters/repositories/sheet/IUpsertSheetRowRepository';
import {
  SheetRowData,
  SheetRowUpsertResult,
} from '../../../core/entities/sheet/SheetRow';
import { ProcessSheetOrderInteractor } from '../../../core/interactor/sheet/ProcessSheetOrderInteractor';

export interface SheetOrderJobData {
  data: SheetRowData;
  sheetName?: string;
}

export interface SheetOrderQueuedResult {
  jobId: string;
  status: 'queued';
}

@Injectable()
export class SheetOrderQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SheetOrderQueue.name);
  private readonly queueName = 'sheet-order-writes';
  private readonly magenta = '\u001b[35m';
  private readonly resetColor = '\u001b[0m';

  private queue?: Queue<SheetOrderJobData, SheetRowUpsertResult, string>;
  private worker?: Worker<SheetOrderJobData, SheetRowUpsertResult, string>;

  constructor(
    private readonly configService: ConfigService,
    @Inject(UPSERT_SHEET_ROW_REPOSITORY)
    private readonly sheetRowRepository: IUpsertSheetRowRepository,
    @Inject(PLANILLA_CONTROL_REPOSITORY)
    private readonly planillaControlRepository: IPlanillaControlRepository,
  ) {}

  onModuleInit(): void {
    const connection = this.redisConnectionOptions();

    this.queue = new Queue<SheetOrderJobData, SheetRowUpsertResult, string>(
      this.queueName,
      {
        connection,
      },
    );
    this.worker = new Worker<SheetOrderJobData, SheetRowUpsertResult, string>(
      this.queueName,
      (job) => this.process(job),
      {
        connection,
        concurrency: this.numberConfig(
          'SHEET_ORDER_QUEUE_CONCURRENCY',
          1,
        ),
        limiter: {
          max: this.numberConfig('SHEET_ORDER_QUEUE_RATE_LIMIT_MAX', 1),
          duration: this.numberConfig(
            'SHEET_ORDER_QUEUE_RATE_LIMIT_DURATION_MS',
            1000,
          ),
        },
      },
    );

    this.worker.on('completed', (job, result) => {
      this.logPurple(
        `Sheet order job completed jobId=${job.id ?? ''} identificador=${this.identificador(job.data)} action=${result.action} row=${result.rowNumber}`,
      );
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Sheet order job failed jobId=${job?.id ?? ''} identificador=${job ? this.identificador(job.data) : ''}: ${error.message}`,
        error.stack,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async enqueue(data: SheetOrderJobData): Promise<SheetOrderQueuedResult> {
    if (!this.queue) {
      throw new Error('Sheet order queue is not initialized.');
    }

    const job = await this.queue.add('upsert-sheet-order', data, this.jobOptions());

    this.logPurple(
      `Sheet order job queued jobId=${job.id ?? ''} identificador=${this.identificador(data)}`,
    );

    return {
      jobId: String(job.id),
      status: 'queued',
    };
  }

  getQueue(): Queue<SheetOrderJobData, SheetRowUpsertResult, string> {
    if (!this.queue) {
      throw new Error('Sheet order queue is not initialized.');
    }

    return this.queue;
  }

  private process(
    job: Job<SheetOrderJobData, SheetRowUpsertResult, string>,
  ): Promise<SheetRowUpsertResult> {
    this.logPurple(
      `Sheet order job processing jobId=${job.id ?? ''} identificador=${this.identificador(job.data)} attempt=${job.attemptsMade + 1}`,
    );

    const interactor = new ProcessSheetOrderInteractor(
      this.sheetRowRepository,
      this.planillaControlRepository,
    );

    return interactor.execute(job.data);
  }

  private redisConnectionOptions(): ConnectionOptions {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (redisUrl) {
      return {
        url: redisUrl,
        maxRetriesPerRequest: null,
      };
    }

    return {
      host: this.configService.get<string>('REDIS_HOST', '127.0.0.1'),
      port: this.numberConfig('REDIS_PORT', 6379),
      username: this.configService.get<string>('REDIS_USERNAME'),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      tls: this.booleanConfig('REDIS_TLS', false) ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  }

  private jobOptions(): JobsOptions {
    return {
      attempts: this.numberConfig('SHEET_ORDER_QUEUE_ATTEMPTS', 5),
      backoff: {
        type: 'exponential',
        delay: this.numberConfig(
          'SHEET_ORDER_QUEUE_BACKOFF_MS',
          5000,
        ),
      },
      removeOnComplete: this.numberConfig(
        'SHEET_ORDER_QUEUE_REMOVE_ON_COMPLETE',
        1000,
      ),
      removeOnFail: this.numberConfig(
        'SHEET_ORDER_QUEUE_REMOVE_ON_FAIL',
        5000,
      ),
    };
  }

  private identificador(data: SheetOrderJobData): string {
    return String(data.data.Identificador ?? '').trim();
  }

  private logPurple(message: string): void {
    this.logger.log(`${this.magenta}${message}${this.resetColor}`);
  }

  private numberConfig(key: string, defaultValue: number): number {
    const value = this.configService.get<string | number>(key);
    const parsedValue = Number(value);

    if (value === undefined || Number.isNaN(parsedValue)) {
      return defaultValue;
    }

    return parsedValue;
  }

  private booleanConfig(key: string, defaultValue: boolean): boolean {
    const value = this.configService.get<string | boolean>(key);

    if (value === undefined) {
      return defaultValue;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    return ['true', '1', 'yes', 'y'].includes(value.toLowerCase());
  }
}
