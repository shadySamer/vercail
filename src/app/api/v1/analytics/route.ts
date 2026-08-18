import { NextRequest, NextResponse } from 'next/server';
import { analyticsEngine } from '@/lib/engine/AnalyticsEngine';
import { DEFAULT_WORKSPACE_ID } from '@/lib/db/seed';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspaceId') || DEFAULT_WORKSPACE_ID;
  const metrics = analyticsEngine.getDashboardMetrics(workspaceId);

  return NextResponse.json(metrics);
}
