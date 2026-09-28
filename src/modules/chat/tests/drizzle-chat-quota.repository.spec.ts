import { describe, expect, it } from 'vitest';
import { InMemoryChatQuotaRepository } from '../infrastructure/in-memory-chat-quota.repository.ts';

describe('Chat free monthly quota adapter contract', () => {
  it('atomically limits each user and month to three reservations and supports compensation', async () => {
    const repository = new InMemoryChatQuotaRepository();
    const reservations = await Promise.all(
      Array.from({ length: 20 }, () =>
        repository.tryReserveFreeMessage('user-1', '2026-09'),
      ),
    );

    expect(reservations.filter(Boolean)).toHaveLength(3);
    await repository.releaseFreeMessage('user-1', '2026-09');
    expect(await repository.tryReserveFreeMessage('user-1', '2026-09')).toBe(
      true,
    );
  });
});
