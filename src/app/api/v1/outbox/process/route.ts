import { NextRequest, NextResponse } from 'next/server';
import { outboxWorker } from '@/lib/engine/OutboxWorker';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get('authorization');
      const customHeader = request.headers.get('x-cron-secret');
      const providedSecret = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7).trim()
        : customHeader;

      if (providedSecret !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized: Invalid CRON_SECRET' }, { status: 401 });
      }
    }

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
