import { Injectable } from '@nestjs/common';
import { ChatQuotaRepositoryPort } from '../application/ports/chat-quota-repository.port.ts';

@Injectable()
export class InMemoryChatQuotaRepository extends ChatQuotaRepositoryPort {
  private readonly freeUsage = new Map<string, number>();

  async tryReserveFreeMessage(
    userId: string,
    monthKey: string,
  ): Promise<boolean> {
    const key = `${userId}:${monthKey}`;
    const current = this.freeUsage.get(key) ?? 0;
    if (current >= 3) return false;
    this.freeUsage.set(key, current + 1);
    return true;
  }

  async releaseFreeMessage(userId: string, monthKey: string): Promise<void> {
    const key = `${userId}:${monthKey}`;
    const current = this.freeUsage.get(key) ?? 0;
    this.freeUsage.set(key, Math.max(current - 1, 0));
  }
}
