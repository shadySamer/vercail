import { hashSha256 } from '../security/crypto';
import { db } from '../db/store';

export class IdempotencyEngine {
  /**
   * Generates a deterministic SHA-256 idempotency key for a network conversion
   */
  public generateKey(
    network: string,
    integrationId: string,
    transactionId: string,
    eventType: string,
    orderItemId?: string
  ): string {
    const rawKey = `${network.toLowerCase()}:${integrationId}:${transactionId.trim()}:${eventType.toLowerCase()}:${(orderItemId || '').trim()}`;
    return hashSha256(rawKey);
  }

  /**
   * Checks if this exact idempotency key exists in the database
   */
  public check(idempotencyKey: string): { isDuplicate: boolean; conversionId?: string } {
    return db.checkIdempotency(idempotencyKey);
  }

  /**
   * Records a processed idempotency key in the database
   */
  public record(idempotencyKey: string, conversionId: string, network: string): void {
    db.recordIdempotency(idempotencyKey, conversionId, network);
  }
}

export const idempotencyEngine = new IdempotencyEngine();
