import { NextResponse } from 'next/server';
import { pingDatabase } from '@/lib/orders';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/health — deployment smoke check for Hostinger / uptime monitors. */
export async function GET() {
  const database = await pingDatabase();
  return NextResponse.json(
    {
      status: database ? 'ok' : 'degraded',
      database,
      stripe: env.stripe.configured(),
      mail: env.smtp.enabled(),
      time: new Date().toISOString(),
    },
    { status: database ? 200 : 503 }
  );
}
