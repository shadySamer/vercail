import { NextRequest, NextResponse } from 'next/server';
import { analyticsEngine } from '@/lib/engine/AnalyticsEngine';
import { getAuthenticatedWorkspace } from '@/lib/security/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = getAuthenticatedWorkspace(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = auth.workspaceId;
  const metrics = analyticsEngine.getDashboardMetrics(workspaceId);

  return NextResponse.json(metrics);
}
