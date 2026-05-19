import { normalizeSuiAddress } from '@mysten/sui/utils';
import { getAgentAddress, isAgentSignerConfigured } from './kms';

export const FALLBACK_TESTNET_AGENT_ADDRESS =
  '0x7bca6f160f30cfc99389e0db8d4a453701da16365fb128588bc7df9348031f9b';

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

export function getPublicAgentAddress(): string {
  const explicit = process.env.NEXT_PUBLIC_LEVO_AGENT_ADDRESS?.trim();
  if (explicit) return explicit;
  if (isAgentSignerConfigured()) return getAgentAddress();
  return FALLBACK_TESTNET_AGENT_ADDRESS;
}

export function getAgentMandateConfig(): AgentMandateConfig {
  const target = process.env.LEVO_AGENT_EARN_TARGET_ADDRESS?.trim();
  const agentAddress = getPublicAgentAddress();

  if (!target) {
    return {
      agentAddress,
      templates: [],
      error:
        'LEVO_AGENT_EARN_TARGET_ADDRESS is not configured. StableLayer Earn mandates are disabled.',
    };
  }

  return {
    agentAddress,
    templates: [
      {
        id: 'stablelayer-earn',
        label: 'StableLayer Earn',
        description: 'Deposit, withdraw, or harvest yield for the configured Earn target.',
        targetAddress: normalizeSuiAddress(target),
      },
    ],
  };
}

export function getConfiguredEarnTargetAddress(): string | null {
  const target = process.env.LEVO_AGENT_EARN_TARGET_ADDRESS?.trim();
  return target ? normalizeSuiAddress(target) : null;
}

export function isConfiguredEarnTargetAddress(target: string): boolean {
  const configured = getConfiguredEarnTargetAddress();
  if (!configured) return false;
  try {
    return normalizeSuiAddress(target) === configured;
  } catch {
    return false;
  }
}
