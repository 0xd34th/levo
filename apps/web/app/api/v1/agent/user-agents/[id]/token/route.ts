import { NextRequest } from 'next/server';
import { getClientIp, noStoreJson, verifySameOrigin } from '@/lib/api';
import { rotateRunnerToken, serializeUserAgent } from '@/lib/agent/user-agent';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rl = await rateLimit(`agent-token-rotate:${getClientIp(req)}`, 60, 10);
  if (!rl.allowed) return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });

  const sameOrigin = verifySameOrigin(req);
  if (!sameOrigin.ok) return sameOrigin.response;

  const auth = await verifyPrivyXAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await rotateRunnerToken({ xUserId: auth.identity.xUserId, userAgentId: id });
  if (!result) return noStoreJson({ error: 'Agent not found' }, { status: 404 });
  return noStoreJson({ agent: serializeUserAgent(result.agent), runnerToken: result.runnerToken });
}
