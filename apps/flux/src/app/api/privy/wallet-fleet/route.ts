import { NextResponse } from 'next/server';
import { requirePrivySession } from '@/lib/privy/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await requirePrivySession(req);
  if ('response' in session) {
    return session.response;
  }

  return NextResponse.json(session.walletFleet, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
