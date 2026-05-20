import { NextRequest } from 'next/server';
import { getClientIp, noStoreJson } from '@/lib/api';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';
import { parseXUserId } from '@/lib/twitter';
import { getEarnSummary } from '@/lib/stable-layer-earn';

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`earn-summary:${ip}`, 60, 30);
  if (!rl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const auth = await verifyPrivyXAuth(req);
  if (!auth.ok) {
    return auth.response;
  }

  const xUserId = parseXUserId(auth.identity.xUserId);
  if (!xUserId) {
    return noStoreJson({ error: 'Invalid X user identifier' }, { status: 400 });
  }

  try {
    return noStoreJson(await getEarnSummary({ xUserId }));
  } catch (error) {
    console.error('Failed to load Earn summary', error);
    return noStoreJson(
      { error: error instanceof Error ? error.message : 'Earn is temporarily unavailable' },
      { status: 503 },
    );
  }
}
