import { NextRequest } from 'next/server';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { z } from 'zod';
import { getClientIp, invalidInputResponse, noStoreJson, verifySameOrigin } from '@/lib/api';
import { loadOwnerWallet } from '@/lib/agent/mandate-flow';
import {
  issueOwnerAgentBindingIntent,
  registerUserAgent,
  serializeUserAgent,
  verifyOwnerAgentBindingIntent,
} from '@/lib/agent/user-agent';
import { prisma } from '@/lib/prisma';
import { getPrivyClient, verifyPrivyXAuth } from '@/lib/privy-auth';
import {
  buildPrivyRawSignAuthorizationRequest,
  signSuiTransaction,
} from '@/lib/privy-wallet';
import { rateLimit } from '@/lib/rate-limit';

const RegisterSchema = z.object({
  agentAddress: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/),
  label: z.string().max(80).optional(),
  authorizationSignature: z.string().min(1).optional(),
  bindingPayloadBase64: z.string().min(1).optional(),
  bindingIntent: z.string().min(1).optional(),
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

  let owner;
  try {
    owner = await loadOwnerWallet(auth.identity.xUserId);
  } catch (error) {
    return noStoreJson(
      { error: error instanceof Error ? error.message : 'Wallet is not set up for this session.' },
      { status: 400 },
    );
  }

  const agentAddress = normalizeSuiAddress(parsed.data.agentAddress);
  const label = parsed.data.label?.trim() || 'External agent';

  if (!parsed.data.authorizationSignature || !parsed.data.bindingPayloadBase64 || !parsed.data.bindingIntent) {
    const binding = issueOwnerAgentBindingIntent({
      ownerXUserId: auth.identity.xUserId,
      ownerAddress: owner.suiAddress,
      agentAddress,
      label,
    });
    const payloadBytes = new Uint8Array(Buffer.from(binding.payloadBase64, 'base64'));
    return noStoreJson({
      status: 'authorization_required',
      authorizationRequest: buildPrivyRawSignAuthorizationRequest(owner.privyWalletId, payloadBytes),
      bindingPayloadBase64: binding.payloadBase64,
      bindingIntent: binding.bindingIntent,
    });
  }

  const intent = verifyOwnerAgentBindingIntent(parsed.data.bindingIntent, {
    ownerXUserId: auth.identity.xUserId,
    ownerAddress: owner.suiAddress,
    agentAddress,
    label,
    payloadBase64: parsed.data.bindingPayloadBase64,
  });
  if (!intent.ok) return noStoreJson({ error: intent.reason }, { status: 400 });

  try {
    await signSuiTransaction(
      getPrivyClient(),
      owner.privyWalletId,
      owner.suiPublicKey,
      new Uint8Array(Buffer.from(parsed.data.bindingPayloadBase64, 'base64')),
      { signatures: [parsed.data.authorizationSignature] },
    );
  } catch (error) {
    console.warn('Failed to authorize external agent binding', {
      xUserId: auth.identity.xUserId,
      agentAddress,
      error,
    });
    return noStoreJson({ error: 'Wallet authorization failed' }, { status: 400 });
  }

  const { agent, runnerToken } = await registerUserAgent({
    xUserId: auth.identity.xUserId,
    agentAddress,
    label,
  });
  return noStoreJson({ agent: serializeUserAgent(agent), runnerToken });
}
