import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';
import { hashPassword, createSessionToken } from '@/lib/security/auth';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = body.email?.toLowerCase().trim();
    const password = body.password;
    const workspaceName = body.workspaceName?.trim() || 'My Production Workspace';

    if (!email || !password || password.length < 8) {
      return NextResponse.json({ error: 'Valid email and password (min 8 chars) are required' }, { status: 400 });
    }

    const existingUser = db.getUserByEmail(email);
    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 409 });
    }

    const workspaceId = `ws-${uuidv4().substring(0, 8)}`;
    db.saveWorkspace({
      id: workspaceId,
      name: workspaceName,
      slug: workspaceName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      createdAt: new Date().toISOString(),
    });

    const userId = `usr-${uuidv4().substring(0, 8)}`;
    const passwordHash = hashPassword(password);

    db.saveUser({
      id: userId,
      workspaceId,
      email,
      passwordHash,
      role: 'owner',
      createdAt: new Date().toISOString(),
    });

    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    db.saveSession({
      id: uuidv4(),
      userId,
      workspaceId,
      token,
      expiresAt,
      createdAt: new Date().toISOString(),
    });

    const response = NextResponse.json({
      success: true,
      token,
      user: {
        id: userId,
        email,
        workspaceId,
        role: 'owner',
      },
    });

    response.cookies.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
