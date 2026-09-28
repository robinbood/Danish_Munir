export abstract class ChatQuotaRepositoryPort {
  abstract tryReserveFreeMessage(
    userId: string,
    monthKey: string,
  ): Promise<boolean>;
  abstract releaseFreeMessage(userId: string, monthKey: string): Promise<void>;
}
