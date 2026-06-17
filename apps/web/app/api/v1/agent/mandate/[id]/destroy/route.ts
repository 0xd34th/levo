import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getClientIp,
  invalidInputResponse,
  noStoreJson,
  verifySameOrigin,
} from '@/lib/api';
import {
  destroyMandate,
  loadOwnerWallet,
} from '@/lib/agent/mandate-flow';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';

const RequestSchema = z.object({
  authorizationSignature: z.string().min(1).optional(),
  txBytesBase64: z.string().min(1).optional(),
  txIntent: z.string().min(1).optional(),
});

// POST /api/v1/agent/mandate/[id]/destroy
// 2-step Privy flow. Reclaims storage rebate for revoked or expired mandates.
// Move-side `destroy_terminated` aborts if the mandate is still active.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`agent-mandate-destroy:${ip}`, 60, 10);
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

  const { id } = await params;
  if (!id) {
    return invalidInputResponse();
  }

  const body = await req.json().catch(() => ({}));
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInputResponse();
  }

  try {
    const owner = await loadOwnerWallet(auth.identity.xUserId);
    const result = await destroyMandate({ owner, mandateRowId: id });
    return noStoreJson(result);
  } catch (error) {
    return noStoreJson(
      { error: error instanceof Error ? error.message : 'Mandate destroy failed' },
      { status: 400 },
    );
  }
}
