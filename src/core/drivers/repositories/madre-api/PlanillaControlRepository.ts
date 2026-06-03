import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IPlanillaControlRepository } from '../../../adapters/repositories/madre-api/IPlanillaControlRepository';
import {
  SheetRowData,
  SheetRowUpsertResult,
} from '../../../entities/sheet/SheetRow';

@Injectable()
export class PlanillaControlRepository implements IPlanillaControlRepository {
  private readonly logger = new Logger(PlanillaControlRepository.name);
  private readonly magenta = '\u001b[35m';
  private readonly resetColor = '\u001b[0m';

  private readonly baseUrl: string;
  private readonly internalApiKey?: string;
  private readonly requestTimeoutMs = 30000;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      'MADRE_API_BASE_URL',
      'https://api.madre.loquieroaca.com',
    );
    this.internalApiKey = this.configService.get<string>(
      'MADRE_API_INTERNAL_API_KEY',
    );
  }

  async sync(
    result: SheetRowUpsertResult,
    data: SheetRowData,
  ): Promise<void> {
    const payload = this.toPayload(data);

    if (result.action === 'inserted') {
      await this.create(payload);
      this.logPurple(
        `Madre API write inserted identificador=${this.readPayloadId(payload)} endpoint=/api/internal/planilla-control`,
      );
      return;
    }

    await this.updateOrCreate(payload);
    this.logPurple(
      `Madre API write updated identificador=${this.readPayloadId(payload)} endpoint=/api/internal/planilla-control/${this.readPayloadId(payload)}`,
    );
  }

  private async create(payload: Record<string, unknown>): Promise<void> {
    const response = await this.request('/api/internal/planilla-control', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (response.status === 409) {
      await this.update(payload);
      return;
    }

    await this.assertOk(response);
  }

  private async updateOrCreate(payload: Record<string, unknown>): Promise<void> {
    const response = await this.update(payload);

    if (response.status === 404) {
      await this.create(payload);
      return;
    }

    await this.assertOk(response);
  }

  private update(payload: Record<string, unknown>): Promise<Response> {
    const id = this.readPayloadId(payload);

    return this.request(
      `/api/internal/planilla-control/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
          ...init.headers,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async assertOk(response: Response): Promise<void> {
    if (response.ok) {
      return;
    }

    const responseText = await response.text();

    throw new Error(
      `Planilla Control API failed with ${response.status}: ${responseText}`,
    );
  }

  private toPayload(data: SheetRowData): Record<string, unknown> {
    const identificador = data.Identificador;

    if (!identificador) {
      throw new Error('Identificador is required to sync Planilla Control.');
    }

    return {
      id: identificador,
      identificador,
      ...data,
    };
  }

  private readPayloadId(payload: Record<string, unknown>): string {
    const id = payload.id;

    if (typeof id !== 'string' || id.trim() === '') {
      throw new Error('id is required to sync Planilla Control.');
    }

    return id;
  }

  private authHeaders(): Record<string, string> {
    if (!this.internalApiKey) {
      return {};
    }

    return {
      'x-internal-api-key': this.internalApiKey,
    };
  }

  private logPurple(message: string): void {
    this.logger.log(`${this.magenta}${message}${this.resetColor}`);
  }
}
