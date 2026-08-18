import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/store';
import { tikTokAdsAdapter } from '../adapters/ad-platform/TikTokAdsAdapter';
import { decryptSecret } from '../security/crypto';
import { OutboxJob, DeliveryAttempt } from '../types';

export class OutboxWorker {
  private isPolling = false;

  /**
   * Process a single Outbox Job with durability and full audit trail
   */
  public async processTask(job: OutboxJob): Promise<{ success: boolean; error?: string }> {
    const conversion = db.getConversionById(job.conversionId);
    if (!conversion) {
      job.status = 'failed_permanent';
      job.lastError = 'Referenced Conversion not found';
      job.updatedAt = new Date().toISOString();
      db.saveOutboxJob(job);
      return { success: false, error: 'Conversion missing' };
    }

    // Resolve Destination
    const destination = db.getDestinationById(job.destinationId, job.workspaceId);
    if (!destination) {
      job.status = 'failed_permanent';
      job.lastError = `Target TikTok Destination (${job.destinationId}) not found in workspace`;
      job.updatedAt = new Date().toISOString();
      conversion.status = 'failed_permanent';
      conversion.errorMessage = job.lastError;
      conversion.processedAt = new Date().toISOString();
      db.saveOutboxJob(job);
      db.saveConversion(conversion);
      return { success: false, error: job.lastError };
    }

    // Decrypt Access Token
    const accessToken = decryptSecret(destination.accessTokenEncrypted);

    // Dispatch to TikTok Events API
    const isSimulated = accessToken.includes('demo') || accessToken.includes('sim') || accessToken.includes('test');
    const dispatchResult = await tikTokAdsAdapter.dispatchConversion(
      conversion,
      destination,
      accessToken,
      { isSimulation: isSimulated }
    );

    // Audit Log Delivery Attempt
    const deliveryAttempt: DeliveryAttempt = {
      id: uuidv4(),
      outboxJobId: job.id,
      conversionId: conversion.id,
      destinationId: destination.id,
      pixelId: destination.pixelId,
      eventName: job.tiktokEventName,
      statusCode: dispatchResult.statusCode,
      latencyMs: dispatchResult.latencyMs,
      requestPayload: {
        event: job.tiktokEventName,
        pixelId: destination.pixelId,
        clickId: conversion.clickId,
        valueStrategy: conversion.valueStrategy,
      },
      responseBody: dispatchResult.responseBody,
      isSuccess: dispatchResult.isSuccess,
      errorClassification: dispatchResult.errorClassification,
      errorMessage: dispatchResult.errorMessage,
      attemptedAt: new Date().toISOString(),
    };
    db.logDeliveryAttempt(deliveryAttempt);

    if (dispatchResult.isSuccess) {
      job.status = 'delivered';
      job.updatedAt = new Date().toISOString();
      conversion.status = 'accepted';
      conversion.processedAt = new Date().toISOString();
      conversion.errorMessage = undefined;

      db.saveOutboxJob(job);
      db.saveConversion(conversion);

      // Update Health
      const healthList = db.getIntegrationHealth(job.workspaceId);
      const health = healthList.find(h => h.integrationId === conversion.integrationId);
      if (health) {
        health.lastTikTokDeliveryAt = new Date().toISOString();
        health.totalConversionsProcessed += 1;
        const total = health.totalConversionsProcessed;
        const failed = health.failedDeliveriesCount;
        health.deliveryRate = total > 0 ? Math.round(((total - failed) / total) * 100) : 100;
        health.updatedAt = new Date().toISOString();
        db.updateIntegrationHealth(health);
      }

      return { success: true };
    } else {
      job.attempts += 1;
      job.lastError = dispatchResult.errorMessage || 'TikTok API delivery failed';
      job.updatedAt = new Date().toISOString();

      if (dispatchResult.errorClassification === 'PERMANENT' || job.attempts >= job.maxAttempts) {
        job.status = 'failed_permanent';
        conversion.status = 'failed_permanent';
        conversion.errorMessage = `Permanent Failure: ${job.lastError}`;
        conversion.processedAt = new Date().toISOString();

        const healthList = db.getIntegrationHealth(job.workspaceId);
        const health = healthList.find(h => h.integrationId === conversion.integrationId);
        if (health) {
          health.failedDeliveriesCount += 1;
          const total = health.totalConversionsProcessed;
          const failed = health.failedDeliveriesCount;
          health.deliveryRate = total > 0 ? Math.round(((total - failed) / total) * 100) : 100;
          health.updatedAt = new Date().toISOString();
          db.updateIntegrationHealth(health);
        }
      } else {
        job.status = 'failed_retryable';
        // Exponential Backoff: 30s * 2^(attempts - 1)
        const delaySeconds = Math.min(3600, Math.pow(2, job.attempts - 1) * 30);
        job.nextRetryAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
        conversion.status = 'failed_retryable';
        conversion.errorMessage = `Retryable failure (Attempt ${job.attempts}/${job.maxAttempts}): ${job.lastError}`;
      }

      db.saveOutboxJob(job);
      db.saveConversion(conversion);
      return { success: false, error: job.lastError };
    }
  }

  /**
   * Poll and process all pending and retryable outbox jobs across server restarts
   */
  public async pollAndProcess(limit: number = 50): Promise<{ processed: number; succeeded: number; failed: number }> {
    if (this.isPolling) return { processed: 0, succeeded: 0, failed: 0 };
    this.isPolling = true;

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    try {
      const pendingJobs = db.getPendingOutboxJobs(limit);
      for (const job of pendingJobs) {
        processed++;
        const result = await this.processTask(job);
        if (result.success) {
          succeeded++;
        } else {
          failed++;
        }
      }
    } finally {
      this.isPolling = false;
    }

    return { processed, succeeded, failed };
  }

  public async processPending(limit: number = 50): Promise<{ processed: number; succeeded: number; failed: number }> {
    return this.pollAndProcess(limit);
  }
}

export const outboxWorker = new OutboxWorker();
