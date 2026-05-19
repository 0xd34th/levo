import { normalizeSuiAddress } from '@mysten/sui/utils';
import { discoverEarnRetainedAccountId } from '@/lib/stable-layer-earn';
import { getAgentAddress, isAgentSignerConfigured } from './kms';

export interface AgentMandateTemplate {
  id: 'stablelayer-earn';
  label: string;
  description: string;
  targetAddress: string;
}

export interface AgentMandateConfig {
  agentAddress: string;
  templates: AgentMandateTemplate[];
  error?: string;
}

export type ResolveEarnRetainedAccountTargetResult =
  | { ok: true; targetAddress: string }
  | { ok: false; error: string; status: number };

export function getPublicAgentAddress(): string {
  const explicit = process.env.NEXT_PUBLIC_LEVO_AGENT_ADDRESS?.trim();
  if (explicit) return normalizeSuiAddress(explicit);
  if (isAgentSignerConfigured()) return getAgentAddress();
  return '';
}

export function getDisabledAgentMandateConfig(error: string): AgentMandateConfig {
  const agentAddress = getPublicAgentAddress();

  return {
    agentAddress,
    templates: [],
    error,
  };
}

export function getAgentMandateConfig(targetAddress: string): AgentMandateConfig {
  const agentAddress = getPublicAgentAddress();
  if (!agentAddress) {
    return {
      agentAddress,
      templates: [],
      error: 'Levo agent address is not configured.',
    };
  }

  return {
    agentAddress,
    templates: [
      {
        id: 'stablelayer-earn',
        label: 'StableLayer Earn',
        description: 'Deposit, withdraw, or harvest yield for your Earn account target.',
        targetAddress: normalizeSuiAddress(targetAddress),
      },
    ],
  };
}

export async function resolveEarnRetainedAccountTarget(params: {
  xUserId: string;
  senderAddress: string;
}): Promise<ResolveEarnRetainedAccountTargetResult> {
  let normalizedSenderAddress: string;
  try {
    normalizedSenderAddress = normalizeSuiAddress(params.senderAddress);
  } catch {
    return {
      ok: false,
      status: 400,
      error: 'Wallet binding has an invalid Sui address.',
    };
  }

  try {
    const targetAddress = await discoverEarnRetainedAccountId({
      xUserId: params.xUserId,
      senderAddress: normalizedSenderAddress,
    });

    if (!targetAddress) {
      return {
        ok: false,
        status: 404,
        error:
          'No StableLayer Earn account target found for this wallet. Open Earn and create a retained account before creating a mandate.',
      };
    }

    return {
      ok: true,
      targetAddress,
    };
  } catch (error) {
    console.warn('Failed to resolve StableLayer Earn account target', {
      xUserId: params.xUserId,
      senderAddress: normalizedSenderAddress,
      error,
    });
    return {
      ok: false,
      status: 503,
      error: 'StableLayer Earn account lookup is temporarily unavailable.',
    };
  }
}
