import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('session_token')?.value;
  if (token) {
    db.deleteSession(token);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete('session_token');
  return response;
}
