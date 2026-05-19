import { getLevoAgentPackageId } from './package';
import { encryptWitnessForAction } from './seal-client';
import {
  type ActionContext,
  deriveActionCommit,
  deriveApprovalIdentity,
  generateWitness,
} from './witness';

// Pre-generated chain step describing a single planned action. Built bottom-up
// so the on-chain witness_commit at consumption time matches the step's
// `currentCommit`. Storage of these rows is what lets the executor advance the
// chain without any further owner involvement.
export interface ChainStep {
  chainIndex: number;
  actionType: number;
  coinType: string;
  target: string;
  amount: bigint;
  currentCommit: Uint8Array; // = on-chain mandate.witness_commit at the moment THIS step is consumed
  nextCommit: Uint8Array; // = what consume_witness rotates witness_commit to
  approvalIdentity: Uint8Array; // = derive_approval_id(...) — Seal blob id
  encryptedObject: Uint8Array; // Seal ciphertext of the witness preimage
}

export interface PlannedAction {
  actionType: number;
  coinType: string;
  target: string;
  amount: bigint;
}

// Generate a witness chain that lets the agent execute `actions` in order.
// Computed bottom-up: a random terminator is chosen for the post-last commit,
// then each step's currentCommit = derive_action_commit(witness_i, ..., next),
// which becomes next-commit for step i-1. Returns steps in execution order
// (chainIndex 0 is the first action the agent will consume).
//
// IMPORTANT: This calls Seal.encrypt once per step. For multi-step chains this
// is the slowest part of mandate setup.
export async function generateChainSteps(args: {
  mandateId: string;
  actions: PlannedAction[];
  packageId?: string;
}): Promise<ChainStep[]> {
  if (args.actions.length === 0) {
    throw new Error('Chain must contain at least one action');
  }

  // Pick a random terminator commit. Any non-empty 32-byte value works; the
  // chain becomes "spent" once on-chain witness_commit equals this value.
  // (Use webcrypto for an ArrayBuffer-backed Uint8Array — node:crypto.randomBytes
  // returns Buffer which trips strict type checks against blake2b's output.)
  const terminator = new Uint8Array(32);
  crypto.getRandomValues(terminator);

  // Walk actions back-to-front to compute commits, then reverse to return
  // in execution order.
  const reversed: ChainStep[] = [];
  let nextCommit: Uint8Array = terminator;

  for (let i = args.actions.length - 1; i >= 0; i -= 1) {
    const action = args.actions[i];
    if (!action) throw new Error(`Missing action at index ${i}`);
    const witness = generateWitness();
    const context: ActionContext = {
      mandateId: args.mandateId,
      coinType: action.coinType,
      actionType: action.actionType,
      target: action.target,
      amount: action.amount,
    };
    const currentCommit = deriveActionCommit({ ...context, witness, nextCommit });
    const approvalIdentity = deriveApprovalIdentity({
      ...context,
      currentCommit,
      nextCommit,
    });
    // Encrypting against Seal uses the just-derived identity; the SDK call also
    // re-computes the same commit internally, but we keep our value as the
    // canonical (it must match the on-chain mandate.witness_commit when consume runs).
    const record = await encryptWitnessForAction({
      ...context,
      witness,
      currentCommit,
      nextCommit,
    });
    reversed.push({
      chainIndex: i,
      actionType: action.actionType,
      coinType: action.coinType,
      target: action.target,
      amount: action.amount,
      currentCommit,
      nextCommit,
      approvalIdentity,
      encryptedObject: record.encryptedObject,
    });
    nextCommit = currentCommit; // for step i-1, this is the next_commit
  }

  return reversed.reverse();
}

// The chainIndex-0 step's currentCommit is what owner sets via set_initial_witness.
export function initialCommit(steps: ChainStep[]): Uint8Array {
  if (steps.length === 0) {
    throw new Error('Cannot derive initial commit from empty chain');
  }
  return steps[0]!.currentCommit;
}

// Convenience to surface the package id at the call site if needed.
export function chainPackageId(override?: string): string {
  return getLevoAgentPackageId(override);
}
