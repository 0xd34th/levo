import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getClientIp, invalidInputResponse, noStoreJson, verifySameOrigin } from '@/lib/api';
import { issueAgentChallenge } from '@/lib/agent/user-agent';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';

const RequestSchema = z.object({
  agentAddress: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/),
});

export async function POST(req: NextRequest) {
  const rl = await rateLimit(`agent-bind-challenge:${getClientIp(req)}`, 60, 20);
  if (!rl.allowed) return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });

  const sameOrigin = verifySameOrigin(req);
  if (!sameOrigin.ok) return sameOrigin.response;

  const auth = await verifyPrivyXAuth(req);
  if (!auth.ok) return auth.response;

  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidInputResponse();

  try {
    return noStoreJson(issueAgentChallenge({
      xUserId: auth.identity.xUserId,
      agentAddress: parsed.data.agentAddress,
    }));
  } catch (error) {
    return noStoreJson(
      { error: error instanceof Error ? error.message : 'Failed to issue challenge' },
      { status: 500 },
    );
  }
}
