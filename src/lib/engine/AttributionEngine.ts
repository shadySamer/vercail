import { db } from '../db/store';
import { NormalizedNetworkResult, AffiliateIntegration, TikTokDestination } from '../types';

export interface AttributionResult {
  status: 'attributed' | 'unattributed' | 'configuration_error';
  resolvedDestination?: TikTokDestination;
  targetEventName: string;
  reason?: string;
}

export class AttributionEngine {
  /**
   * Deterministically attributes an inbound normalized transaction to its explicitly configured TikTok Destination.
   * STRICT ZERO FALLBACK:
   * 1. If missing Click ID (ttclid) -> 'unattributed' (Financial conversion saved, skipped TikTok dispatch)
   * 2. If no TikTok Destination explicitly assigned -> 'configuration_error' (No fallback to first/default pixel)
   * 3. If Click ID + Destination exist -> 'attributed' -> ready for durable Outbox dispatch
   */
  public attribute(
    normalized: NormalizedNetworkResult,
    integration: AffiliateIntegration,
    workspaceId: string
  ): AttributionResult {
    // 1. Check Explicit Destination Assignment (STRICT: NO RANDOM FALLBACK)
    if (!integration.destinationId) {
      return {
        status: 'configuration_error',
        targetEventName: integration.eventName || 'CompletePayment',
        reason: `Configuration Error: Affiliate integration "${integration.name}" has no TikTok Destination assigned. Please assign a TikTok Destination in settings.`,
      };
    }

    const destination = db.getDestinationById(integration.destinationId, workspaceId);
    if (!destination || destination.status !== 'active') {
      return {
        status: 'configuration_error',
        targetEventName: integration.eventName || 'CompletePayment',
        reason: `Configuration Error: Assigned TikTok Destination (${integration.destinationId}) not found or inactive.`,
      };
    }

    // 2. Resolve Single Source of Truth for Event Name
    const targetEventName = integration.eventName || destination.defaultEventName || 'CompletePayment';

    // 3. Check Deterministic TikTok Click ID (ttclid) Evidence
    const clickId = normalized.clickIdClean || (normalized as any).clickId;
    if (!clickId || clickId.trim() === '') {
      return {
        status: 'unattributed',
        resolvedDestination: destination,
        targetEventName,
        reason: 'Missing or unreplaced TikTok Click ID (ttclid). Conversion saved for financial reporting but skipped TikTok dispatch.',
      };
    }

    // 4. Fully Attributed
    return {
      status: 'attributed',
      resolvedDestination: destination,
      targetEventName,
    };
  }
}

export const attributionEngine = new AttributionEngine();
