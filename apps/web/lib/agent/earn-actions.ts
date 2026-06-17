import { executeEarnAction, previewEarnAction } from '@/lib/stable-layer-earn';
import { AGENT_ACTION } from './package';
import { getAgentAuthorizationPrivateKey } from './delegated-signing';

// Maps a single-bit mandate action to the Earn execution verb.
export type AgentEarnAction = 'stake' | 'withdraw' | 'claim';

export function earnActionFromBits(actions: number): AgentEarnAction | null {
  if (actions === AGENT_ACTION.EARN_DEPOSIT) return 'stake';
  if (actions === AGENT_ACTION.EARN_WITHDRAW) return 'withdraw';
  if (actions === AGENT_ACTION.EARN_HARVEST) return 'claim';
  return null;
}

// Execute one Earn action for a user non-custodially from the background worker.
//
// Reuses the same server-side Earn pipeline as the interactive /earn page
// (preview → execute, with all accounting / gas sponsorship / yield settlement).
// deposit/withdraw need a wallet signature: the first call stages the tx, the
// second signs it with the platform authorization key (delegated, no custody).
// harvest (claim) is manager-signed server-side and completes in one call.
export async function executeAgentEarnAction(params: {
  xUserId: string;
  privyUserId: string;
  action: AgentEarnAction;
  amount?: string; // base-unit string for stake/withdraw; ignored for claim
}): Promise<{ status: 'confirmed' | 'pending'; txDigest: string }> {
  const preview = await previewEarnAction({
    xUserId: params.xUserId,
    action: params.action,
    amount: params.amount,
  });

  let res = await executeEarnAction({
    xUserId: params.xUserId,
    privyUserId: params.privyUserId,
    previewToken: preview.previewToken,
  });

  if (res.status === 'authorization_required') {
    res = await executeEarnAction({
      xUserId: params.xUserId,
      privyUserId: params.privyUserId,
      previewToken: preview.previewToken,
      authorizationPrivateKeys: [getAgentAuthorizationPrivateKey()],
    });
  }

  if (res.status === 'authorization_required') {
    throw new Error('Earn action still required authorization after delegated signing');
  }

  // confirmed | pending | partial — a transaction was submitted in every case.
  return {
    status: res.status === 'confirmed' ? 'confirmed' : 'pending',
    txDigest: res.txDigest,
  };
}
