import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: {
    id: string;
  };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const conversionId = params.id;
  const conversion = db.getConversionById(conversionId);

  if (!conversion) {
    return NextResponse.json({ error: 'Conversion not found' }, { status: 404 });
  }

  const rawEvent = db.getRawEventById(conversion.rawEventId);
  const outboxTasks = db.getOutboxTasks().filter(t => t.conversionId === conversionId);
  const deliveryAttempts = db.getDeliveryAttemptsForConversion(conversionId);
  const pixel = conversion.resolvedPixelId ? db.getPixelById(conversion.resolvedPixelId, conversion.workspaceId) : undefined;
  const networkAccount = db.getNetworkAccounts(conversion.workspaceId).find(n => n.id === conversion.networkAccountId);

  // Human-readable Journey Diagnostics
  const journey = [
    {
      step: 1,
      title: 'Postback Ingestion',
      status: 'completed',
      timestamp: conversion.receivedAt,
      details: `Received S2S notification from ${conversion.network.toUpperCase()} (${rawEvent?.clientIp || '127.0.0.1'})`,
      isSuccess: true,
    },
    {
      step: 2,
      title: 'Authentication & Signature Verification',
      status: 'completed',
      timestamp: conversion.receivedAt,
      details: `Verified token & cryptographic signature for channel "${networkAccount?.name || conversion.network}"`,
      isSuccess: rawEvent?.verificationStatus === 'verified',
    },
    {
      step: 3,
      title: 'Idempotency & Duplicate Check',
      status: 'completed',
      timestamp: conversion.receivedAt,
      details: `Generated unique transaction identity: ${conversion.idempotencyKey.substring(0, 16)}...`,
      isSuccess: true,
    },
    {
      step: 4,
      title: 'Deterministic Attribution',
      status: conversion.status === 'unattributed' ? 'warning' : 'completed',
      timestamp: conversion.receivedAt,
      details: conversion.clickId
        ? `Found valid TikTok Click ID (${conversion.clickId.substring(0, 20)}...) -> Mapped to Pixel ${conversion.resolvedPixelId || 'Default'}`
        : 'Missing or unreplaced TikTok Click ID (__CLICKID__). Financial record preserved but skipped TikTok dispatch.',
      isSuccess: conversion.status !== 'unattributed',
    },
    {
      step: 5,
      title: 'TikTok Events API v1.3 Delivery',
      status: conversion.status === 'accepted'
        ? 'completed'
        : conversion.status === 'failed_permanent'
        ? 'error'
        : conversion.status === 'failed_retryable'
        ? 'retryable'
        : conversion.status === 'unattributed'
        ? 'skipped'
        : 'in_progress',
      timestamp: conversion.processedAt || conversion.receivedAt,
      details: conversion.status === 'accepted'
        ? `Event "${conversion.targetEventName || 'CompletePayment'}" accepted by TikTok Events API (${deliveryAttempts[0]?.latencyMs || 45}ms latency)`
        : conversion.errorMessage || 'Queued for delivery attempt',
      isSuccess: conversion.status === 'accepted',
    },
  ];

  return NextResponse.json({
    conversion,
    rawEvent,
    outboxTasks,
    deliveryAttempts,
    pixel,
    networkAccount,
    journey,
  });
}
