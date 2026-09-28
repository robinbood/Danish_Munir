import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { RENEWAL_SCAN_INTERVAL_MS } from '../../../shared/infrastructure/persistence/tokens.ts';
import { ProcessDueRenewalsUseCase } from '../application/use-cases/process-due-renewals.use-case.ts';

const DEFAULT_SCAN_INTERVAL_MS = 60_000;

@Injectable()
export class RenewalScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RenewalScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(private readonly processDueRenewals: ProcessDueRenewalsUseCase) {}

  onModuleInit(): void {
    const intervalMs = Number(
      process.env[RENEWAL_SCAN_INTERVAL_MS] ?? DEFAULT_SCAN_INTERVAL_MS,
    );
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000) {
      throw new RangeError(
        `${RENEWAL_SCAN_INTERVAL_MS} must be an integer of at least 1000.`,
      );
    }

    this.timer = setInterval(() => void this.run(), intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      await this.processDueRenewals.execute();
    } catch (error) {
      this.logger.error('Failed to process due subscription renewals.', error);
    } finally {
      this.running = false;
    }
  }
}
