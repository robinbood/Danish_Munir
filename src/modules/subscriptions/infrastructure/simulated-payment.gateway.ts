import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PAYMENT_FAILURE_RATE } from '../../../shared/infrastructure/persistence/tokens.ts';
import type {
  PaymentGateway,
  PaymentRequest,
} from '../application/ports/payment-gateway.port.ts';
import type { PaymentOutcome } from '../domain/renewal-policy.ts';

@Injectable()
export class SimulatedPaymentGateway implements PaymentGateway {
  private readonly outcomes = new Map<string, PaymentOutcome>();

  async charge(request: PaymentRequest): Promise<PaymentOutcome> {
    const previousOutcome = this.outcomes.get(request.idempotencyKey);
    if (previousOutcome) return previousOutcome;

    const failureRate = Number(process.env[PAYMENT_FAILURE_RATE] ?? 0.1);

    if (!Number.isFinite(failureRate) || failureRate < 0 || failureRate > 1) {
      throw new RangeError(
        `${PAYMENT_FAILURE_RATE} must be a number between 0 and 1.`,
      );
    }

    if (Math.random() < failureRate) {
      const outcome: PaymentOutcome = {
        status: 'failed',
        reason: 'Simulated payment decline.',
      };
      this.outcomes.set(request.idempotencyKey, outcome);
      return outcome;
    }

    const outcome: PaymentOutcome = {
      status: 'succeeded',
      receiptId: randomUUID(),
      amount: request.amount,
    };
    this.outcomes.set(request.idempotencyKey, outcome);
    return outcome;
  }
}
