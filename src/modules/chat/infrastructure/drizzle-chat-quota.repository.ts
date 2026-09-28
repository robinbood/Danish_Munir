import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { ChatQuotaRepositoryPort } from '../application/ports/chat-quota-repository.port.ts';
import { UnitOfWork } from '../../../shared/infrastructure/persistence/unit-of-work.ts';
import { freeQuotaUsage } from './chat-db.schema.ts';

@Injectable()
export class DrizzleChatQuotaRepository extends ChatQuotaRepositoryPort {
  constructor(private readonly unitOfWork: UnitOfWork) {
    super();
  }

  async tryReserveFreeMessage(
    userId: string,
    monthKey: string,
  ): Promise<boolean> {
    const rows = await this.unitOfWork
      .current()
      .insert(freeQuotaUsage)
      .values({ userId, monthKey, usedCount: 1 })
      .onConflictDoUpdate({
        target: [freeQuotaUsage.userId, freeQuotaUsage.monthKey],
        set: {
          usedCount: sql`${freeQuotaUsage.usedCount} + 1`,
          updatedAt: new Date(),
        },
        setWhere: sql`${freeQuotaUsage.usedCount} < 3`,
      })
      .returning({ userId: freeQuotaUsage.userId });

    return rows.length === 1;
  }

  async releaseFreeMessage(userId: string, monthKey: string): Promise<void> {
    await this.unitOfWork
      .current()
      .update(freeQuotaUsage)
      .set({
        usedCount: sql`${freeQuotaUsage.usedCount} - 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(freeQuotaUsage.userId, userId),
          eq(freeQuotaUsage.monthKey, monthKey),
          sql`${freeQuotaUsage.usedCount} > 0`,
        ),
      );
  }
}
