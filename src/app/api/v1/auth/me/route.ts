import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedWorkspace } from '@/lib/security/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = getAuthenticatedWorkspace(request);
  if (!auth) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    workspaceId: auth.workspaceId,
    user: auth.user ? {
      id: auth.user.id,
      email: auth.user.email,
      role: auth.user.role,
      workspaceId: auth.user.workspaceId,
    } : undefined,
  });
}
