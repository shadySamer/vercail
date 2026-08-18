import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/store';
import { networkRegistry } from '@/lib/adapters/network/NetworkRegistry';
import { idempotencyEngine } from '@/lib/engine/IdempotencyEngine';
import { attributionEngine } from '@/lib/engine/AttributionEngine';
import { outboxWorker } from '@/lib/engine/OutboxWorker';
import { sanitizeInboundPayload } from '@/lib/security/crypto';
import { NetworkType, RawInboundEvent, CanonicalConversion, OutboxJob } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: {
    network: string;
    slug: string[];
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return handlePostback(request, params, {});
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  let body: any = {};
  const contentType = request.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      const obj: Record<string, any> = {};
      formData.forEach((value, key) => {
        obj[key] = value;
      });
      body = obj;
    } else {
      const text = await request.text();
      try {
        body = JSON.parse(text);
      } catch {
        body = { rawText: text };
      }
    }
  } catch {
    body = { parseError: 'Failed to read body stream' };
  }

  return handlePostback(request, params, body);
}

async function handlePostback(request: NextRequest, params: RouteParams['params'], body: any) {
  const network = params.network.toLowerCase() as NetworkType;
  const slug = params.slug || [];

  let workspaceId: string | undefined = undefined;
  let token = '';

  if (slug.length === 1) {
    token = slug[0];
  } else if (slug.length >= 2) {
    workspaceId = slug[0];
    token = slug[1];
  } else {
    return new NextResponse('Invalid Postback Path', { status: 400 });
  }

  const url = new URL(request.url);
  const queryParams: Record<string, string> = {};
  url.searchParams.forEach((val, key) => {
    queryParams[key] = val;
  });

  const headers: Record<string, string> = {};
  request.headers.forEach((val, key) => {
    headers[key] = val;
  });

  const clientIp = headers['x-forwarded-for']?.split(',')[0].trim() || '127.0.0.1';

  // 1. Resolve Integration & Token Authenticity (Zero workspace trust from sender)
  const integration = db.getIntegrationByToken(network, token, workspaceId);
  const activeWorkspaceId = integration ? integration.workspaceId : (workspaceId || 'ws-master-01');

  // 2. Persist Sanitized Raw Inbound Event First (Evidence First Persistence)
  const rawEventId = uuidv4();
  const rawInboundEvent: RawInboundEvent = {
    id: rawEventId,
    workspaceId: activeWorkspaceId,
    network,
    integrationId: integration?.id,
    headers: sanitizeInboundPayload(headers),
    queryParams: sanitizeInboundPayload(queryParams),
    body: sanitizeInboundPayload(body),
    rawPayload: JSON.stringify(sanitizeInboundPayload({ query: queryParams, body })),
    clientIp,
    verificationStatus: 'unverified',
    processingStatus: 'received',
    receivedAt: new Date().toISOString(),
  };

  const adapter = networkRegistry.getAdapter(network);
  if (!adapter) {
    rawInboundEvent.verificationStatus = 'invalid_token';
    rawInboundEvent.processingStatus = 'failed';
    rawInboundEvent.errorMessage = `Unsupported affiliate network: ${network}`;
    db.logRawInboundEvent(rawInboundEvent);
    return new NextResponse('Unsupported Network', { status: 400 });
  }

  if (!integration) {
    rawInboundEvent.verificationStatus = 'invalid_token';
    rawInboundEvent.processingStatus = 'failed';
    rawInboundEvent.errorMessage = `Invalid security token or unknown integration for network: ${network}`;
    db.logRawInboundEvent(rawInboundEvent);
    return new NextResponse('Unauthorized: Invalid Ingestion Token', { status: 401 });
  }

  // 3. Cryptographic Signature & Verification
  const postbackContext = {
    network,
    workspaceId: activeWorkspaceId,
    networkAccount: integration,
    headers,
    query: queryParams,
    body,
    clientIp,
  };

  const verification = await adapter.verify(postbackContext);
  if (!verification.isValid) {
    rawInboundEvent.verificationStatus = 'failed_signature';
    rawInboundEvent.processingStatus = 'failed';
    rawInboundEvent.errorMessage = verification.error || 'Signature verification failed';
    db.logRawInboundEvent(rawInboundEvent);
    return new NextResponse(`Verification Failed: ${verification.error}`, { status: 403 });
  }

  rawInboundEvent.verificationStatus = 'verified';

  // 4. Normalize to Canonical Data Model
  const normalized = await adapter.normalize(postbackContext);

  // Strict Mandatory Transaction ID Check (NO fake IDs generated)
  if (!normalized.isVerified || !normalized.transactionId || normalized.transactionId.trim() === '') {
    rawInboundEvent.processingStatus = 'quarantined';
    rawInboundEvent.errorMessage = normalized.verificationError || 'Missing mandatory Transaction ID from network payload';
    db.logRawInboundEvent(rawInboundEvent);
    return new NextResponse(`Invalid Transaction Payload: ${rawInboundEvent.errorMessage}`, { status: 400 });
  }

  // 5. Idempotency Key Generation
  const idempotencyKey = idempotencyEngine.generateKey(
    network,
    integration.id,
    normalized.transactionId,
    normalized.eventType,
    normalized.orderItemId
  );

  // 6. Strict Deterministic Attribution (STRICT ZERO DESTINATION FALLBACK)
  const attribution = attributionEngine.attribute(normalized, integration, activeWorkspaceId);

  // 7. Assemble Canonical Conversion Data Model
  const conversionId = uuidv4();
  let conversionStatus: any = 'unattributed';
  if (attribution.status === 'attributed') {
    conversionStatus = 'queued';
  } else if (attribution.status === 'configuration_error') {
    conversionStatus = 'configuration_error';
  }

  const conversion: CanonicalConversion = {
    id: conversionId,
    workspaceId: activeWorkspaceId,
    rawEventId,
    network,
    integrationId: integration.id,
    destinationId: attribution.resolvedDestination?.id,
    transactionId: normalized.transactionId,
    parentTransactionId: normalized.parentTransactionId,
    orderItemId: normalized.orderItemId,
    eventType: normalized.eventType,
    tiktokEventName: attribution.targetEventName,
    valueStrategy: integration.valueStrategy || 'commission',
    currency: normalized.currency || null,
    commissionAmount: normalized.amountCommission !== null && normalized.amountCommission !== undefined ? normalized.amountCommission : null,
    grossAmount: normalized.amountGross !== null && normalized.amountGross !== undefined ? normalized.amountGross : null,
    clickId: normalized.clickIdClean || undefined,
    status: conversionStatus,
    idempotencyKey,
    receivedAt: rawInboundEvent.receivedAt,
    errorMessage: attribution.reason,
  };

  // 8. Prepare Outbox Job ONLY if fully Attributed with assigned Destination & ttclid
  let outboxJob: OutboxJob | undefined = undefined;
  if (attribution.status === 'attributed' && attribution.resolvedDestination) {
    outboxJob = {
      id: uuidv4(),
      workspaceId: activeWorkspaceId,
      conversionId,
      destinationId: attribution.resolvedDestination.id,
      tiktokEventName: attribution.targetEventName,
      payload: {
        event: attribution.targetEventName,
        event_id: conversion.id, // Deterministic stable Event ID for TikTok deduplication across retries
        click_id: normalized.clickIdClean,
        value_strategy: integration.valueStrategy || 'commission',
        commission_amount: normalized.amountCommission,
        gross_amount: normalized.amountGross,
        currency: normalized.currency,
      },
      status: 'pending',
      attempts: 0,
      maxAttempts: 5,
      nextRetryAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  rawInboundEvent.processingStatus = 'processed';

  // 9. Execute Single Atomic DB Transaction (P0 Ingestion Atomicity Guarantee)
  const ingestionResult = await db.executeAtomicConversionIngestionAsync({
    rawEvent: rawInboundEvent,
    idempotencyKey,
    conversion,
    outboxJob,
  });

  if (ingestionResult.isDuplicate) {
    // Record duplicate attempt in health stats
    const healthList = db.getIntegrationHealth(activeWorkspaceId);
    const health = healthList.find(h => h.integrationId === integration.id);
    if (health) {
      health.duplicateCount += 1;
      health.updatedAt = new Date().toISOString();
      db.updateIntegrationHealth(health);
    }

    const successResp = adapter.getSuccessResponse(postbackContext);
    return new NextResponse(successResp.body, {
      status: successResp.statusCode,
      headers: { 'Content-Type': successResp.contentType },
    });
  }

  if (!ingestionResult.success) {
    return new NextResponse(`Internal Storage Error: ${ingestionResult.error}`, { status: 500 });
  }

  // 10. Update Integration Health Metrics
  const healthList = db.getIntegrationHealth(activeWorkspaceId);
  let health = healthList.find(h => h.integrationId === integration.id);
  if (health) {
    health.lastPostbackAt = rawInboundEvent.receivedAt;
    health.totalPostbacksReceived += 1;
    if (attribution.status === 'attributed') {
      health.totalConversionsProcessed += 1;
    } else {
      health.missingClickIdCount += 1;
    }
    const total = health.totalPostbacksReceived;
    const missing = health.missingClickIdCount;
    health.attributionRate = total > 0 ? Math.round(((total - missing) / total) * 100) : 100;
    health.updatedAt = new Date().toISOString();
    db.updateIntegrationHealth(health);
  }

  // 11. Trigger background dispatch (non-blocking; durability guaranteed by database)
  if (outboxJob) {
    setImmediate(() => {
      outboxWorker.processTask(outboxJob!).catch(err => {
        console.error('Outbox worker dispatch error:', err);
      });
    });
  }

  // 12. Respond with Network-specific confirmation body
  const successResp = adapter.getSuccessResponse(postbackContext);
  return new NextResponse(successResp.body, {
    status: successResp.statusCode,
    headers: { 'Content-Type': successResp.contentType },
  });
}
