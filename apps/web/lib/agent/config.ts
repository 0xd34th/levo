import { normalizeSuiAddress } from '@mysten/sui/utils';
import type { UserAgent } from '@/lib/generated/prisma/client';

export interface AgentMandateTemplate {
  id: 'stablelayer-earn';
  label: string;
  description: string;
  targetAddress: string;
}

export interface AgentMandateConfig {
  agentAddress: string;
  userAgentId: string | null;
  agentLabel: string | null;
  executionMode: 'external_runner';
  templates: AgentMandateTemplate[];
  error?: string;
}

export type ResolveEarnMandateTargetResult =
  | { ok: true; targetAddress: string }
  | { ok: false; error: string; status: number };

export function getDisabledAgentMandateConfig(error: string): AgentMandateConfig {
  return {
    agentAddress: '',
    userAgentId: null,
    agentLabel: null,
    executionMode: 'external_runner',
    templates: [],
    error,
  };
}

export function getAgentMandateConfig(
  targetAddress: string,
  userAgent: Pick<UserAgent, 'id' | 'agentAddress' | 'label'> | null,
): AgentMandateConfig {
  if (!userAgent) {
    return {
      agentAddress: '',
      userAgentId: null,
      agentLabel: null,
      executionMode: 'external_runner',
      templates: [],
      error: 'No active external agent is configured. Bind an agent before creating mandates.',
    };
  }

  return {
    agentAddress: normalizeSuiAddress(userAgent.agentAddress),
    userAgentId: userAgent.id,
    agentLabel: userAgent.label,
    executionMode: 'external_runner',
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

export async function resolveEarnMandateTarget(params: {
  xUserId: string;
  senderAddress: string;
}): Promise<ResolveEarnMandateTargetResult> {
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

  // Levo's normal Earn deposit path uses the wallet EOA as the Bucket account.
  // The `levo-earn-retained` account object is only created by retained-yield
  // settlement, so requiring it would block users who already deposited.
  return {
    ok: true,
    targetAddress: normalizedSenderAddress,
  };
}
