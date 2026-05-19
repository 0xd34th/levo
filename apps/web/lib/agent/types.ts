// TypeScript shapes mirroring the v2 levo-agent Move package. Field order and types
// match `mandate.move` / `payment.move` / `action_registry.move` exactly so this file
// is the single source of truth for off-chain marshaling.

export interface CoinLimit {
  // Move TypeName canonical form, e.g. "0xabc...::usdc::USDC" (with 0x prefix re-added off-chain).
  coinType: string;
  perTxCap: bigint;
  periodCap: bigint;
  periodSpent: bigint;
  periodStartMs: bigint;
}

export interface Mandate {
  id: string; // Sui object ID
  owner: string;
  agent: string;
  actions: number; // u32 bitfield
  coinLimits: CoinLimit[];
  periodMs: bigint;
  allowedTargets: string[];
  expiryMs: bigint;
  witnessCommit: string; // hex-encoded vector<u8>; empty until set_initial_witness
  // V2 field (post-Pass 4). 0 at create, increments on init + each rotation.
  nonce: bigint;
  revoked: boolean;
  metadata: Record<string, string>;
}

// ---------- Events ----------

export interface MandateCreatedEvent {
  mandateId: string;
  owner: string;
  agent: string;
  actions: number;
  periodMs: bigint;
  expiryMs: bigint;
}

export interface MandateRevokedEvent {
  mandateId: string;
  by: string;
  atMs: bigint;
}

export interface MandateExpiryUpdatedEvent {
  mandateId: string;
  oldExpiryMs: bigint;
  newExpiryMs: bigint;
}

export interface MandateDestroyedEvent {
  mandateId: string;
  by: string;
  atMs: bigint;
  finalNonce: bigint;
}

export interface WitnessRotatedEvent {
  mandateId: string;
  // Empty when this rotation is the initial witness (set_initial_witness).
  previousCommit: string;
  newCommit: string;
  nonce: bigint;
}

export interface WitnessConsumedEvent {
  mandateId: string;
  actionType: number;
  coinType: string;
  target: string;
  amount: bigint;
  atMs: bigint;
  nonce: bigint;
  witnessCommitBefore: string;
  witnessCommitAfter: string;
}

export interface AuthorizedActionEvent {
  mandateId: string;
  coinType: string;
  target: string;
  amount: bigint;
}

// ---------- Specs (input shapes for creating mandates) ----------

export interface CoinLimitSpec {
  coinType: string;
  perTxCap: bigint;
  periodCap: bigint;
}

export interface MandateSpec {
  agent: string;
  actions: number; // bitfield; must be ⊆ V1_ACTION_MASK
  coinLimits: CoinLimitSpec[];
  periodMs: bigint;
  allowedTargets: string[];
  expiryMs: bigint;
  metadata?: Record<string, string>;
}
