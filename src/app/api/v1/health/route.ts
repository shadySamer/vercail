import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';
import { networkRegistry } from '@/lib/adapters/network/NetworkRegistry';
import { getAuthenticatedWorkspace } from '@/lib/security/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = getAuthenticatedWorkspace(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = auth.workspaceId;

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
