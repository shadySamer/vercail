import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';
import { getAuthenticatedWorkspace } from '@/lib/security/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = getAuthenticatedWorkspace(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = auth.workspaceId;
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status');
  const networkFilter = url.searchParams.get('network');
  const search = url.searchParams.get('search')?.toLowerCase();

  let conversions = db.getConversions(workspaceId, 500);

  if (statusFilter && statusFilter !== 'all') {
    conversions = conversions.filter(c => c.status === statusFilter);
  }
  if (networkFilter && networkFilter !== 'all') {
    conversions = conversions.filter(c => c.network === networkFilter);
  }
  if (search) {
    conversions = conversions.filter(c =>
      c.transactionId.toLowerCase().includes(search) ||
      (c.clickId && c.clickId.toLowerCase().includes(search)) ||
      (c.offerName && c.offerName.toLowerCase().includes(search))
    );
  }

  return NextResponse.json({
    total: conversions.length,
    conversions,
  });
}
