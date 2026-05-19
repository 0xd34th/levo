import { normalizeSuiAddress } from '@mysten/sui/utils';

const RAW_PACKAGE_ID = process.env.NEXT_PUBLIC_LEVO_AGENT_PACKAGE_ID;

export const LEVO_AGENT_MODULES = {
  mandate: 'mandate',
  payment: 'payment',
  actionRegistry: 'action_registry',
  sealPolicy: 'seal_policy',
} as const;

// Action bitfield — mirrors mandate.move v2 constants. Single-bit values only;
// multi-bit combinations are rejected by both `assert_action_allowed` and `seal_approve`.
export const AGENT_ACTION = {
  SEND: 1,
  EARN_DEPOSIT: 2,
  EARN_WITHDRAW: 4,
  EARN_HARVEST: 8,
  SWAP: 16,
  PULL: 32,
} as const;

// V1 mask: only earn_* allowed. mandate::create rejects any other bit (EActionNotImplementedYet).
export const V1_ACTION_MASK =
  AGENT_ACTION.EARN_DEPOSIT | AGENT_ACTION.EARN_WITHDRAW | AGENT_ACTION.EARN_HARVEST;

export type AgentActionValue = (typeof AGENT_ACTION)[keyof typeof AGENT_ACTION];

// Move-side caps must match mandate.move; if the Move package changes these,
// update both the constants and the zod schemas.
export const MANDATE_LIMITS = {
  maxPeriodMs: 31_536_000_000n, // 1 year
  maxTargets: 32,
  maxCoinLimits: 16,
  maxMetadataEntries: 16,
  maxMetadataKeyLen: 64,
  maxMetadataValueLen: 256,
  maxWitnessLen: 256,
  maxCommitLen: 256,
} as const;

export function getLevoAgentPackageId(override?: string): string {
  const pkg = (override ?? RAW_PACKAGE_ID)?.trim();
  if (!pkg) {
    throw new Error(
      'NEXT_PUBLIC_LEVO_AGENT_PACKAGE_ID is not configured. Add the v2 PackageID from packages/levo-agent/Published.toml to your env.',
    );
  }
  return pkg;
}

export function isLevoAgentConfigured(): boolean {
  return Boolean(RAW_PACKAGE_ID?.trim());
}

export function getMandateStructType(packageId = getLevoAgentPackageId()): string {
  return `${packageId}::${LEVO_AGENT_MODULES.mandate}::Mandate`;
}

// Return the canonical Move `TypeName::name` form for a coin / struct.
// Matches `type_name::with_defining_ids<T>()` output: hex address without `0x`
// prefix, padded to 64 chars, followed by `::module::Type`.
export function toMoveTypeName(coinType: string): string {
  const [addr, ...rest] = coinType.split('::');
  if (!addr || rest.length < 2) {
    throw new Error(`Invalid Move type string: ${coinType}`);
  }
  const normalized = normalizeSuiAddress(addr).replace(/^0x/, '');
  return `${normalized}::${rest.join('::')}`;
}

// All event struct names emitted by levo-agent. Useful for indexer filters.
export const LEVO_AGENT_EVENTS = {
  mandateCreated: 'MandateCreated',
  mandateRevoked: 'MandateRevoked',
  mandateExpiryUpdated: 'MandateExpiryUpdated',
  mandateDestroyed: 'MandateDestroyed',
  witnessRotated: 'WitnessRotated',
  witnessConsumed: 'WitnessConsumed',
  earnDepositAuthorized: 'EarnDepositAuthorized',
  earnWithdrawAuthorized: 'EarnWithdrawAuthorized',
  earnHarvestAuthorized: 'EarnHarvestAuthorized',
} as const;

export function getEventType(
  event: keyof typeof LEVO_AGENT_EVENTS,
  packageId = getLevoAgentPackageId(),
): string {
  const eventName = LEVO_AGENT_EVENTS[event];
  const moduleName: string =
    event === 'witnessConsumed'
      ? LEVO_AGENT_MODULES.payment
      : event.startsWith('earn')
        ? LEVO_AGENT_MODULES.actionRegistry
        : LEVO_AGENT_MODULES.mandate;
  return `${packageId}::${moduleName}::${eventName}`;
}
