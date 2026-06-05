import { NextRequest } from 'next/server';
import {
  getAgentMandateConfig,
  getDisabledAgentMandateConfig,
  resolveEarnMandateTarget,
} from '@/lib/agent/config';
import { loadOwnerWallet } from '@/lib/agent/mandate-flow';
import { getDefaultUserAgent } from '@/lib/agent/user-agent';
import {
  getClientIp,
  noStoreJson,
  verifySameOrigin,
} from '@/lib/api';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`agent-config:${ip}`, 60, 30);
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

  let owner;
  try {
    owner = await loadOwnerWallet(auth.identity.xUserId);
  } catch (error) {
    return noStoreJson(
      getDisabledAgentMandateConfig(
        error instanceof Error ? error.message : 'Wallet is not set up for this session.',
      ),
    );
  }

  const target = await resolveEarnMandateTarget({
    xUserId: auth.identity.xUserId,
    senderAddress: owner.suiAddress,
  });
  if (!target.ok) {
    return noStoreJson(getDisabledAgentMandateConfig(target.error));
  }

  const userAgent = await getDefaultUserAgent(auth.identity.xUserId);
  return noStoreJson(getAgentMandateConfig(target.targetAddress, userAgent));
}
