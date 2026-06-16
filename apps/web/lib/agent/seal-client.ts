import { SealClient, SessionKey } from '@mysten/seal';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { getAgentKeypair } from './kms';
import { getLevoAgentPackageId } from './package';
import { getAgentSuiClient } from './sui-client';
import { buildSealApproveTx } from './tx';
import {
  bytesToHex,
  deriveActionCommit,
  deriveApprovalIdentity,
  generateWitness,
  type ActionContext,
} from './witness';

const SESSION_KEY_TTL_MIN = 30;

let _sealClient: SealClient | null = null;
// Session keys are TTL-bound; cache by agent address. Re-create on expiry.
let _sessionKeys = new Map<string, SessionKey>();

function loadSealConfig(): { objectId: string; aggregatorUrl: string } {
  const objectId = process.env.LEVO_AGENT_SEAL_OBJECT_ID?.trim();
  const aggregatorUrl = process.env.LEVO_AGENT_SEAL_AGGREGATOR_URL?.trim();
  if (!objectId || !aggregatorUrl) {
    throw new Error(
      'Seal MPC not configured. Set LEVO_AGENT_SEAL_OBJECT_ID + LEVO_AGENT_SEAL_AGGREGATOR_URL from https://seal-docs.wal.app/Pricing.',
    );
  }
  return { objectId, aggregatorUrl };
}

export function isSealConfigured(): boolean {
  const objectId = process.env.LEVO_AGENT_SEAL_OBJECT_ID?.trim();
  const aggregatorUrl = process.env.LEVO_AGENT_SEAL_AGGREGATOR_URL?.trim();
  return Boolean(objectId && aggregatorUrl);
}

export function getSealClient(): SealClient {
  if (!_sealClient) {
    const { objectId, aggregatorUrl } = loadSealConfig();
    _sealClient = new SealClient({
      suiClient: getAgentSuiClient(),
      serverConfigs: [{ objectId, weight: 1, aggregatorUrl }],
      // V1 trusts the published Mysten committee config; revisit before mainnet.
      verifyKeyServers: false,
    });
  }
  return _sealClient;
}

export async function getAgentSessionKey(signer: Ed25519Keypair = getAgentKeypair()): Promise<SessionKey> {
  const address = signer.getPublicKey().toSuiAddress();
  const existing = _sessionKeys.get(address);
  if (existing && !existing.isExpired()) {
    return existing;
  }
  const sessionKey = await SessionKey.create({
    address,
    packageId: getLevoAgentPackageId(),
    ttlMin: SESSION_KEY_TTL_MIN,
    signer,
    suiClient: getAgentSuiClient(),
  });
  _sessionKeys.set(address, sessionKey);
  return sessionKey;
}

// Test-only escape hatch — production code does not call this.
export function __resetSealStateForTests(): void {
  _sealClient = null;
  _sessionKeys = new Map();
}

// ---------- Encrypt a witness preimage ----------

export interface EncryptWitnessArgs extends ActionContext {
  /** Witness preimage to encrypt. If omitted, a fresh 32-byte witness is generated. */
  witness?: Uint8Array;
  /** Required: the commit value that this witness rotates TO. */
  nextCommit: Uint8Array;
}

export interface EncryptedWitnessRecord {
  witness: Uint8Array; // returned so caller can derive the commit and store both
  encryptedObject: Uint8Array; // Seal ciphertext to store off-chain (DB)
  actionCommit: Uint8Array; // = derive_action_commit(...) — what goes on-chain
  approvalIdentity: Uint8Array; // = derive_approval_id(...) — Seal blob id
  approvalIdentityHex: string; // hex (no 0x) form used as Seal `id`
}

/**
 * Encrypt a fresh witness preimage against the Seal committee with an identity
 * bound to the exact (mandate, action, target, coin, amount, current=? , next)
 * context. Stores nothing locally — caller owns persistence.
 *
 * NOTE: For the initial witness, `currentCommit` is the all-zero / empty
 * placeholder — Seal's `id` derivation uses ApprovalIdentityMaterial which
 * includes `current_commit`. The caller must use the witness_commit value
 * that the on-chain mandate will hold at the moment of decryption.
 */
export async function encryptWitnessForAction(
  args: EncryptWitnessArgs & { currentCommit: Uint8Array },
): Promise<EncryptedWitnessRecord> {
  const witness = args.witness ?? generateWitness();

  // Derive the action commit — this is the value the caller will set as
  // mandate.witness_commit so that consume_witness validates correctly.
  const actionCommit = deriveActionCommit({
    mandateId: args.mandateId,
    coinType: args.coinType,
    actionType: args.actionType,
    target: args.target,
    amount: args.amount,
    witness,
    nextCommit: args.nextCommit,
  });

  // Derive the approval identity used as Seal blob id.
  const approvalIdentity = deriveApprovalIdentity({
    mandateId: args.mandateId,
    coinType: args.coinType,
    actionType: args.actionType,
    target: args.target,
    amount: args.amount,
    currentCommit: args.currentCommit,
    nextCommit: args.nextCommit,
  });

  // Seal `id` is a hex string (no 0x prefix per reference repo conventions).
  const approvalIdentityHex = bytesToHex(approvalIdentity).slice(2);

  const { encryptedObject } = await getSealClient().encrypt({
    threshold: 1,
    packageId: getLevoAgentPackageId(),
    id: approvalIdentityHex,
    data: witness,
  });

  return { witness, encryptedObject, actionCommit, approvalIdentity, approvalIdentityHex };
}

// ---------- Decrypt a stored witness for execution ----------

export interface DecryptWitnessArgs extends ActionContext {
  encryptedObject: Uint8Array;
  approvalIdentity: Uint8Array; // must match the identity used at encrypt-time
  nextCommit: Uint8Array;
  signer?: Ed25519Keypair;
}

/**
 * Ask the Seal committee to release the witness preimage for this action. The
 * committee dry-runs `seal_approve(...)` against the live mandate; if it
 * passes, the SDK returns the 32-byte witness. If it fails (revoked, over-cap,
 * disallowed target, ...), Seal throws a typed error we surface unchanged.
 */
export async function decryptWitnessForAction(args: DecryptWitnessArgs): Promise<Uint8Array> {
  const sessionKey = await getAgentSessionKey(args.signer);
  const sealApproveTx: Transaction = buildSealApproveTx({
    identity: args.approvalIdentity,
    mandateId: args.mandateId,
    coinType: args.coinType,
    actionType: args.actionType,
    target: args.target,
    amount: args.amount,
    nextCommit: args.nextCommit,
  });
  const txBytes = await sealApproveTx.build({
    client: getAgentSuiClient(),
    onlyTransactionKind: true,
  });

  return getSealClient().decrypt({
    data: args.encryptedObject,
    sessionKey,
    txBytes,
  });
}
