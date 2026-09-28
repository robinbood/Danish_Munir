import { describe, expect, it } from 'vitest';
import { ChatQuotaPolicy } from '../domain/chat-quota-policy.ts';
import { MonthlyPeriod } from '../domain/monthly-period.ts';

describe('ChatQuotaPolicy', () => {
  it('spends free allowance before a paid bundle', () => {
    const policy = new ChatQuotaPolicy();
    const bundle = {
      id: 'bundle-1',
      plan: 'pro' as const,
      remainingMessages: 12,
      endsAt: new Date('2026-12-01T00:00:00.000Z'),
    };

    expect(policy.decide(2, [bundle], MonthlyPeriod.of('2026-09'))).toEqual({
      kind: 'free',
      period: MonthlyPeriod.of('2026-09'),
    });
    expect(policy.decide(3, [bundle], MonthlyPeriod.of('2026-09'))).toEqual({
      kind: 'bundle',
      bundle,
    });
  });

  it('rejects when neither free allowance nor a paid bundle is available', () => {
    const policy = new ChatQuotaPolicy();

    expect(policy.decide(3, [], MonthlyPeriod.of('2026-09'))).toEqual({
      kind: 'rejected',
    });
  });

  it('selects the bundle with the greatest remaining capacity deterministically', () => {
    const policy = new ChatQuotaPolicy();
    const selected = policy.chooseBundle([
      {
        id: 'basic',
        plan: 'basic',
        remainingMessages: 10,
        endsAt: new Date('2026-12-01'),
      },
      {
        id: 'pro-b',
        plan: 'pro',
        remainingMessages: 90,
        endsAt: new Date('2026-10-01'),
      },
      {
        id: 'pro-a',
        plan: 'pro',
        remainingMessages: 90,
        endsAt: new Date('2026-11-01'),
      },
    ]);

    expect(selected?.id).toBe('pro-a');
  });
});
