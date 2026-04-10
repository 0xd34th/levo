import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getClientIp, invalidInputResponse, noStoreJson, verifySameOrigin } from '@/lib/api';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';
import { executeEarnAction } from '@/lib/stable-layer-earn';
import { parseXUserId } from '@/lib/twitter';

const RequestSchema = z.object({
  previewToken: z.string().min(1),
  authorizationSignature: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`earn-execute:${ip}`, 60, 10);
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

  const xUserId = parseXUserId(auth.identity.xUserId);
  if (!xUserId) {
    return noStoreJson({ error: 'Invalid X user identifier' }, { status: 400 });
  }

  try {
    return noStoreJson(await executeEarnAction({
      xUserId,
      privyUserId: auth.identity.privyUserId,
      previewToken: parsed.data.previewToken,
      authorizationSignature: parsed.data.authorizationSignature,
    }));
  } catch (error) {
    return noStoreJson(
      { error: error instanceof Error ? error.message : 'Earn execution failed' },
      { status: 400 },
    );
  }
}
