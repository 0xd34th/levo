import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getClientIp, invalidInputResponse, noStoreJson, verifySameOrigin } from '@/lib/api';
import {
  registerUserAgent,
  serializeUserAgent,
  verifyAgentChallengeSignature,
} from '@/lib/agent/user-agent';
import { prisma } from '@/lib/prisma';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';

const RegisterSchema = z.object({
  agentAddress: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/),
  label: z.string().min(1).max(80).optional(),
  challengeToken: z.string().min(1),
  signature: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const rl = await rateLimit(`agent-list:${getClientIp(req)}`, 60, 60);
  if (!rl.allowed) return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });

  const sameOrigin = verifySameOrigin(req);
  if (!sameOrigin.ok) return sameOrigin.response;

  const auth = await verifyPrivyXAuth(req);
  if (!auth.ok) return auth.response;

  const agents = await prisma.userAgent.findMany({
    where: { xUserId: auth.identity.xUserId },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });
  return noStoreJson({ agents: agents.map(serializeUserAgent) });
}

export async function POST(req: NextRequest) {
  const rl = await rateLimit(`agent-register:${getClientIp(req)}`, 60, 12);
  if (!rl.allowed) return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });

  const sameOrigin = verifySameOrigin(req);
  if (!sameOrigin.ok) return sameOrigin.response;

  const auth = await verifyPrivyXAuth(req);
  if (!auth.ok) return auth.response;

  const parsed = RegisterSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidInputResponse();

  const verified = await verifyAgentChallengeSignature({
    xUserId: auth.identity.xUserId,
    agentAddress: parsed.data.agentAddress,
    challengeToken: parsed.data.challengeToken,
    signature: parsed.data.signature,
  });
  if (!verified.ok) return noStoreJson({ error: verified.error }, { status: 400 });

  const { agent, runnerToken } = await registerUserAgent({
    xUserId: auth.identity.xUserId,
    agentAddress: verified.agentAddress,
    label: parsed.data.label,
  });
  return noStoreJson({ agent: serializeUserAgent(agent), runnerToken });
}
