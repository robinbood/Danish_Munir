import type { Money } from '../../domain/money.ts';
import type { PaymentOutcome } from '../../domain/renewal-policy.ts';

export const PAYMENT_GATEWAY = Symbol('PaymentGateway');

export type PaymentRequest = {
  subscriptionId: string;
  userId: string;
  idempotencyKey: string;
  amount: Money;
  description: string;
};

/**
 * Outbound port for charging a billing cycle. The domain depends on the
 * `PaymentOutcome` value, never on this interface, so swapping the simulated
 * gateway for a real provider touches only the infrastructure layer.
 */
export interface PaymentGateway {
  charge(request: PaymentRequest): Promise<PaymentOutcome>;
}
