import { NextRequest, NextResponse } from 'next/server';
import { outboxWorker } from '@/lib/engine/OutboxWorker';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const result = await outboxWorker.processPending(limit);
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
