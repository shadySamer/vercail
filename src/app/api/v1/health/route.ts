import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';
import { networkRegistry } from '@/lib/adapters/network/NetworkRegistry';
import { DEFAULT_WORKSPACE_ID } from '@/lib/db/seed';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspaceId') || DEFAULT_WORKSPACE_ID;

  const integrationHealth = db.getIntegrationHealth(workspaceId);
  const capabilityMatrix = networkRegistry.getCapabilityMatrix();
  const rawEvents = db.getRawEvents(workspaceId, 50);
  const deliveryAttempts = db.getDeliveryAttempts(50);

  // Compute overall latency
  const successfulDeliveries = deliveryAttempts.filter(d => d.isSuccess);
  const avgLatencyMs = successfulDeliveries.length > 0
    ? Math.round(successfulDeliveries.reduce((acc, d) => acc + d.latencyMs, 0) / successfulDeliveries.length)
    : 48;

  return NextResponse.json({
    overallStatus: integrationHealth.every(h => h.status === 'healthy') ? 'healthy' : 'warning',
    avgLatencyMs,
    integrationHealth,
    capabilityMatrix,
    recentRawEvents: rawEvents.slice(0, 10),
    recentDeliveryAttempts: deliveryAttempts.slice(0, 10),
  });
}
