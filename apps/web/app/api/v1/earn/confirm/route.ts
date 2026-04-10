import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getClientIp, invalidInputResponse, noStoreJson, verifySameOrigin } from '@/lib/api';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';
import { confirmEarnAction } from '@/lib/stable-layer-earn';

const RequestSchema = z.object({
  txDigest: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`earn-confirm:${ip}`, 60, 20);
  if (!rl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const sameOrigin = verifySameOrigin(req);
  if (!sameOrigin.ok) {
    return sameOrigin.response;
  }

  const auth = await verifyPrivyXAuth(req);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInputResponse();
  }

  try {
    const result = await confirmEarnAction({
      txDigest: parsed.data.txDigest,
    });
    return noStoreJson(result, { status: result.status === 'pending' ? 202 : 200 });
  } catch (error) {
    return noStoreJson(
      { error: error instanceof Error ? error.message : 'Earn confirmation failed' },
      { status: 400 },
    );
  }
}
