import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/store';
import { networkRegistry } from '@/lib/adapters/network/NetworkRegistry';
import { idempotencyEngine } from '@/lib/engine/IdempotencyEngine';
import { attributionEngine } from '@/lib/engine/AttributionEngine';
import { outboxWorker } from '@/lib/engine/OutboxWorker';
import { NetworkType, RawInboundEvent, CanonicalConversion, OutboxJob } from '@/lib/types';

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

  // 1. Resolve Integration & Token Authenticity
  const integration = db.getIntegrationByToken(network, token, workspaceId);
  const activeWorkspaceId = integration ? integration.workspaceId : (workspaceId || 'ws-master-01');

  // 2. Immutable Raw Inbound Ledger Record
  const rawEventId = uuidv4();
  const rawInboundEvent: RawInboundEvent = {
    id: rawEventId,
    workspaceId: activeWorkspaceId,
    network,
    integrationId: integration?.id,
    headers,
    queryParams,
    body,
    rawPayload: JSON.stringify({ query: queryParams, body }),
    clientIp,
    verificationStatus: 'unverified',
    processingStatus: 'processed',
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

  // 5. Idempotency & Deduplication Engine Check
  const idempotencyKey = idempotencyEngine.generateKey(
    network,
    integration.id,
    normalized.transactionId,
    normalized.eventType,
    normalized.orderItemId
  );

  const idempotencyCheck = idempotencyEngine.check(idempotencyKey);
  if (idempotencyCheck.isDuplicate) {
    rawInboundEvent.processingStatus = 'duplicate';
    rawInboundEvent.errorMessage = `Duplicate transaction suppressed: ${normalized.transactionId}`;
    db.logRawInboundEvent(rawInboundEvent);

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

  // 6. Strict Deterministic Attribution (STRICT ZERO FALLBACK)
  const attribution = attributionEngine.attribute(normalized, integration, activeWorkspaceId);

  // 7. Persist Canonical Conversion
  const conversionId = uuidv4();
  let conversionStatus = 'unattributed';
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
    currency: normalized.currency,
    commissionAmount: normalized.commissionAmount,
    grossAmount: normalized.grossAmount,
    clickId: normalized.clickId,
    status: conversionStatus as any,
    idempotencyKey,
    receivedAt: rawInboundEvent.receivedAt,
    errorMessage: attribution.reason,
    // Audit metadata
    productName: normalized.productName,
    customerIp: normalized.customerIp,
    customerUserAgent: normalized.customerUserAgent,
  };

  const saveResult = db.saveConversion(conversion);
  if (saveResult.isDuplicate) {
    // Handled race condition duplicate at DB constraint level
    rawInboundEvent.processingStatus = 'duplicate';
    db.logRawInboundEvent(rawInboundEvent);
    const successResp = adapter.getSuccessResponse(postbackContext);
    return new NextResponse(successResp.body, { status: successResp.statusCode });
  }

  idempotencyEngine.record(idempotencyKey, conversionId, network);
  db.logRawInboundEvent(rawInboundEvent);

  // 8. Update Health Stats
  const healthList = db.getIntegrationHealth(activeWorkspaceId);
  let health = healthList.find(h => h.integrationId === integration.id);
  if (health) {
    health.lastPostbackAt = rawInboundEvent.receivedAt;
    health.totalPostbacksReceived += 1;
    if (attribution.status !== 'attributed') {
      health.missingClickIdCount += 1;
    }
    const total = health.totalPostbacksReceived;
    const missing = health.missingClickIdCount;
    health.attributionRate = total > 0 ? Math.round(((total - missing) / total) * 100) : 100;
    health.updatedAt = new Date().toISOString();
    db.updateIntegrationHealth(health);
  }

  // 9. Enqueue Outbox Task ONLY if fully Attributed with assigned Destination & ttclid
  if (attribution.status === 'attributed' && attribution.resolvedDestination) {
    const outboxJob: OutboxJob = {
      id: uuidv4(),
      workspaceId: activeWorkspaceId,
      conversionId,
      destinationId: attribution.resolvedDestination.id,
      tiktokEventName: attribution.targetEventName,
      payload: {
        event: attribution.targetEventName,
        event_id: normalized.orderItemId || normalized.transactionId,
        click_id: normalized.clickId,
        value_strategy: integration.valueStrategy || 'commission',
        commission_amount: normalized.commissionAmount,
        gross_amount: normalized.grossAmount,
        currency: normalized.currency,
      },
      status: 'pending',
      attempts: 0,
      maxAttempts: 5,
      nextRetryAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.saveOutboxJob(outboxJob);

    // Asynchronously trigger outbox processing
    setImmediate(() => {
      outboxWorker.processTask(outboxJob).catch(err => {
        console.error('Outbox worker immediate dispatch error:', err);
      });
    });
  }

  // 10. Respond with Network-specific confirmation
  const successResp = adapter.getSuccessResponse(postbackContext);
  return new NextResponse(successResp.body, {
    status: successResp.statusCode,
    headers: { 'Content-Type': successResp.contentType },
  });
}
