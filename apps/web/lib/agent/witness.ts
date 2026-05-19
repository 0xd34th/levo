import { randomBytes } from 'node:crypto';
import { bcs } from '@mysten/sui/bcs';
import { toHex } from '@mysten/sui/utils';
import { blake2b } from '@noble/hashes/blake2.js';
import { toMoveTypeName } from './package';

// On-chain hash scheme — must match mandate.move v2 exactly. Any drift here breaks
// witness chain validation and the Seal MPC committee's dry-run of seal_approve.
//
// Move side definitions (packages/levo-agent/sources/mandate.move):
//   struct ActionCommitMaterial    { version, witness, mandate_id, action_type, target, coin_type, amount, next_commit }
//   struct ApprovalIdentityMaterial { version, mandate_id, current_commit, action_type, target, coin_type, amount, next_commit }
//   const HASH_MATERIAL_VERSION_V1 = 1
//   commit = blake2b256(bcs::to_bytes(material))

const HASH_VERSION_V1 = 1;
const WITNESS_BYTES = 32;
const HASH_BYTES = 32;

const TypeNameBcs = bcs.struct('TypeName', { name: bcs.string() });

const ActionCommitMaterialBcs = bcs.struct('ActionCommitMaterial', {
  version: bcs.u8(),
  witness: bcs.vector(bcs.u8()),
  mandate_id: bcs.Address,
  action_type: bcs.u32(),
  target: bcs.Address,
  coin_type: TypeNameBcs,
  amount: bcs.u64(),
  next_commit: bcs.vector(bcs.u8()),
});

const ApprovalIdentityMaterialBcs = bcs.struct('ApprovalIdentityMaterial', {
  version: bcs.u8(),
  mandate_id: bcs.Address,
  current_commit: bcs.vector(bcs.u8()),
  action_type: bcs.u32(),
  target: bcs.Address,
  coin_type: TypeNameBcs,
  amount: bcs.u64(),
  next_commit: bcs.vector(bcs.u8()),
});

export interface ActionContext {
  mandateId: string; // 0x-prefixed Sui object ID
  coinType: string; // Move type string, "0x...::module::Type"
  actionType: number; // u32 single-bit value
  target: string;
  amount: bigint;
}

/**
 * Generate a fresh witness preimage. Used at mandate setup time to seed a new
 * chain step; the agent never knows the preimage until Seal MPC releases it.
 */
export function generateWitness(): Uint8Array {
  return randomBytes(WITNESS_BYTES);
}

/**
 * Compute the on-chain witness_commit value that `rotate_witness` will validate
 * against. Off-chain callers must use this to (a) build the initial commit at
 * setup time, and (b) verify Seal's stored ciphertext binds to the intended
 * action context.
 */
export function deriveActionCommit(
  args: ActionContext & {
    witness: Uint8Array;
    nextCommit: Uint8Array;
  },
): Uint8Array {
  if (args.witness.length !== WITNESS_BYTES) {
    throw new Error(`witness must be ${WITNESS_BYTES} bytes; got ${args.witness.length}`);
  }
  const bytes = ActionCommitMaterialBcs.serialize({
    version: HASH_VERSION_V1,
    witness: Array.from(args.witness),
    mandate_id: args.mandateId,
    action_type: args.actionType,
    target: args.target,
    coin_type: { name: toMoveTypeName(args.coinType) },
    amount: args.amount,
    next_commit: Array.from(args.nextCommit),
  }).toBytes();
  return blake2b(bytes, { dkLen: HASH_BYTES });
}

/**
 * Compute the Seal-side blob identity (the `id` parameter to `seal_approve`).
 * Mirrors mandate.move `derive_approval_id` exactly.
 */
export function deriveApprovalIdentity(
  args: ActionContext & {
    currentCommit: Uint8Array;
    nextCommit: Uint8Array;
  },
): Uint8Array {
  const bytes = ApprovalIdentityMaterialBcs.serialize({
    version: HASH_VERSION_V1,
    mandate_id: args.mandateId,
    current_commit: Array.from(args.currentCommit),
    action_type: args.actionType,
    target: args.target,
    coin_type: { name: toMoveTypeName(args.coinType) },
    amount: args.amount,
    next_commit: Array.from(args.nextCommit),
  }).toBytes();
  return blake2b(bytes, { dkLen: HASH_BYTES });
}

/** Convenience: 0x-prefixed hex form for logging and DB storage. Seal SDK `id`
 * input is bare hex — strip the prefix at the call site if needed. */
export function bytesToHex(bytes: Uint8Array): string {
  return `0x${toHex(bytes)}`;
}

/** Convenience: parse a 0x-prefixed or bare hex string back to bytes. Throws if invalid. */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error(`hex string has odd length: ${hex}`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const byte = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(`hex string contains invalid byte at offset ${i}: ${hex}`);
    }
    out[i] = byte;
  }
  return out;
}
