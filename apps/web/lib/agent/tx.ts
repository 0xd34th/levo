import { bcs } from '@mysten/sui/bcs';
import {
  Transaction,
  type TransactionObjectArgument,
} from '@mysten/sui/transactions';
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import {
  AGENT_ACTION,
  LEVO_AGENT_MODULES,
  getLevoAgentPackageId,
  toMoveTypeName,
} from './package';
import type { MandateSpec } from './types';

// Kept for backwards-compat with `witness.ts` consumers; the framework
// `type_name::with_defining_ids<C>()` factory is preferred in Move calls because
// the BCS string Move emits is the canonical one (with no `0x` prefix on the
// address part).
const TypeNameBcs = bcs.struct('TypeName', { name: bcs.string() });

function clockArg(tx: Transaction): TransactionObjectArgument {
  return tx.object(SUI_CLOCK_OBJECT_ID);
}

// ---------- mandate.move ----------

/**
 * Build a `mandate::create` move call. Caller (`ctx.sender()`) becomes the owner.
 * Returns the resulting Mandate as a transaction object argument so the caller
 * can chain `share`, `set_initial_witness`, or hold it owned in the same PTB.
 *
 * Caller must pair with `share` (or hold owned) for the runtime to use this mandate.
 */
export function buildCreateMandateMoveCall(
  tx: Transaction,
  spec: MandateSpec,
  packageId = getLevoAgentPackageId(),
): TransactionObjectArgument {
  const coinTypes = spec.coinLimits.map((c) => c.coinType);
  const perTxCaps = spec.coinLimits.map((c) => c.perTxCap);
  const periodCaps = spec.coinLimits.map((c) => c.periodCap);
  const metadata = spec.metadata ?? {};
  const metadataKeys = Object.keys(metadata);
  const metadataValues = metadataKeys.map((k) => metadata[k]!);

  // `vector<TypeName>` is not a pure type — Sui's PTB resolver requires struct
  // arguments to be produced on-chain. Produce each TypeName via the framework
  // `type_name::with_defining_ids<C>()` factory, then assemble into a vector.
  const typeNameResults = coinTypes.map((ct) =>
    tx.moveCall({
      target: '0x1::type_name::with_defining_ids',
      typeArguments: [ct],
    }),
  );
  const coinTypesVec = tx.makeMoveVec({
    type: '0x0000000000000000000000000000000000000000000000000000000000000001::type_name::TypeName',
    elements: typeNameResults,
  });

  return tx.moveCall({
    target: `${packageId}::${LEVO_AGENT_MODULES.mandate}::create`,
    arguments: [
      tx.pure.address(spec.agent),
      tx.pure.u32(spec.actions),
      coinTypesVec,
      tx.pure.vector('u64', perTxCaps),
      tx.pure.vector('u64', periodCaps),
      tx.pure.u64(spec.periodMs),
      tx.pure.vector('address', spec.allowedTargets),
      tx.pure.u64(spec.expiryMs),
      tx.pure.vector('string', metadataKeys),
      tx.pure.vector('string', metadataValues),
      clockArg(tx),
    ],
  });
}

/**
 * Build a full "create + share" PTB. This is the typical owner-side onboarding tx
 * (single Privy signature → mandate is on-chain and shared, ready for owner's
 * subsequent `set_initial_witness` call).
 */
export function buildCreateAndShareMandateTx(
  spec: MandateSpec,
  packageId = getLevoAgentPackageId(),
): Transaction {
  const tx = new Transaction();
  const mandate = buildCreateMandateMoveCall(tx, spec, packageId);
  tx.moveCall({
    target: `${packageId}::${LEVO_AGENT_MODULES.mandate}::share`,
    arguments: [mandate],
  });
  return tx;
}

/**
 * Build `mandate::set_initial_witness`. Per F-5 fix this MUST be sent by the owner.
 * `commit` is the initial witness commitment returned by Seal MPC; this function
 * makes no claim about its source.
 */
export function buildSetInitialWitnessTx(
  mandateId: string,
  commit: Uint8Array,
  packageId = getLevoAgentPackageId(),
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::${LEVO_AGENT_MODULES.mandate}::set_initial_witness`,
    arguments: [
      tx.object(mandateId),
      tx.pure.vector('u8', Array.from(commit)),
      clockArg(tx),
    ],
  });
  return tx;
}

export function buildRevokeMandateTx(
  mandateId: string,
  packageId = getLevoAgentPackageId(),
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::${LEVO_AGENT_MODULES.mandate}::revoke`,
    arguments: [tx.object(mandateId), clockArg(tx)],
  });
  return tx;
}

export function buildUpdateExpiryTx(
  mandateId: string,
  newExpiryMs: bigint,
  packageId = getLevoAgentPackageId(),
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::${LEVO_AGENT_MODULES.mandate}::update_expiry`,
    arguments: [
      tx.object(mandateId),
      tx.pure.u64(newExpiryMs),
      clockArg(tx),
    ],
  });
  return tx;
}

export function buildDestroyTerminatedTx(
  mandateId: string,
  packageId = getLevoAgentPackageId(),
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::${LEVO_AGENT_MODULES.mandate}::destroy_terminated`,
    arguments: [tx.object(mandateId), clockArg(tx)],
  });
  return tx;
}

// ---------- payment.move + action_registry.move (agent runtime PTB) ----------

export interface ConsumeAndAuthorizeArgs {
  mandateId: string;
  coinType: string; // type parameter <C>
  action: number; // single-bit; must be in V1 mask
  target: string;
  amount: bigint;
  witness: Uint8Array; // preimage released by Seal MPC for this action
  nextCommit: Uint8Array; // next commit chosen by Seal MPC
}

/**
 * Single-PTB action runtime: `consume_witness<C>` → matching `authorize_*<C>`.
 * The hot-potato WitnessReceipt is consumed in the same PTB, so this MUST be
 * submitted as one transaction by the agent (sender == mandate.agent).
 *
 * Only V1 actions (earn_deposit / earn_withdraw / earn_harvest) are supported.
 */
export function buildConsumeAndAuthorizeTx(
  args: ConsumeAndAuthorizeArgs,
  packageId = getLevoAgentPackageId(),
): Transaction {
  const tx = new Transaction();
  const mandate = tx.object(args.mandateId);

  const receipt = tx.moveCall({
    target: `${packageId}::${LEVO_AGENT_MODULES.payment}::consume_witness`,
    typeArguments: [args.coinType],
    arguments: [
      mandate,
      tx.pure.u32(args.action),
      tx.pure.address(args.target),
      tx.pure.u64(args.amount),
      tx.pure.vector('u8', Array.from(args.witness)),
      tx.pure.vector('u8', Array.from(args.nextCommit)),
      clockArg(tx),
    ],
  });

  const authorizeFn =
    args.action === AGENT_ACTION.EARN_DEPOSIT
      ? 'authorize_earn_deposit'
      : args.action === AGENT_ACTION.EARN_WITHDRAW
        ? 'authorize_earn_withdraw'
        : args.action === AGENT_ACTION.EARN_HARVEST
          ? 'authorize_earn_harvest'
          : null;
  if (!authorizeFn) {
    throw new Error(
      `Unsupported action ${args.action} — V1 supports only earn_deposit / earn_withdraw / earn_harvest`,
    );
  }

  tx.moveCall({
    target: `${packageId}::${LEVO_AGENT_MODULES.actionRegistry}::${authorizeFn}`,
    typeArguments: [args.coinType],
    arguments: [
      receipt,
      mandate,
      tx.pure.address(args.target),
      tx.pure.u64(args.amount),
    ],
  });

  return tx;
}

// ---------- seal_policy.move ----------

/**
 * Build a `seal_policy::seal_approve` dry-run PTB. This PTB is NOT submitted —
 * Seal MPC committee runs it via `dev-inspect` to decide whether to release the
 * decryption keys for a stored witness ciphertext.
 *
 * Caller must serialize via `tx.build({ client, onlyTransactionKind: true })`
 * and pass those bytes to `SealClient.decrypt(...)`.
 */
export interface SealApproveArgs {
  identity: Uint8Array; // derive_approval_id(...) bytes
  mandateId: string;
  coinType: string;
  actionType: number;
  target: string;
  amount: bigint;
  nextCommit: Uint8Array;
}

export function buildSealApproveTx(
  args: SealApproveArgs,
  packageId = getLevoAgentPackageId(),
): Transaction {
  const tx = new Transaction();
  // seal_approve<C> takes the coin type as a Move type argument (not a value).
  // This keeps the PTB flat (only pure args) so the Seal aggregator can parse
  // it. Move-side recomputes TypeName via `type_name::with_defining_ids<C>()`.
  tx.moveCall({
    target: `${packageId}::${LEVO_AGENT_MODULES.sealPolicy}::seal_approve`,
    typeArguments: [args.coinType],
    arguments: [
      tx.pure.vector('u8', Array.from(args.identity)),
      tx.object(args.mandateId),
      tx.pure.u32(args.actionType),
      tx.pure.address(args.target),
      tx.pure.u64(args.amount),
      tx.pure.vector('u8', Array.from(args.nextCommit)),
      clockArg(tx),
    ],
  });
  return tx;
}

// Re-export the TypeName BCS struct so seal-client and other modules can BCS-encode
// the same way without duplicating the schema.
export { TypeNameBcs };

// ---------- read-only helpers ----------

/**
 * Build the Move-side commit derivation. Off-chain we compute the SAME hash that
 * `mandate::rotate_witness` validates against, so callers can pre-flight the
 * commit derivation (useful for tests, indexers, dry-run flows).
 *
 * NOTE: This is a Sui dev-inspect call, not a state-mutating transaction.
 */
export function buildDeriveActionCommitTx(
  args: {
    mandateId: string;
    coinType: string;
    actionType: number;
    target: string;
    amount: bigint;
    witness: Uint8Array;
    nextCommit: Uint8Array;
  },
  packageId = getLevoAgentPackageId(),
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::${LEVO_AGENT_MODULES.mandate}::derive_action_commit`,
    typeArguments: [args.coinType],
    arguments: [
      tx.pure.vector('u8', Array.from(args.witness)),
      tx.pure.address(args.mandateId),
      tx.pure.u32(args.actionType),
      tx.pure.address(args.target),
      tx.pure.u64(args.amount),
      tx.pure.vector('u8', Array.from(args.nextCommit)),
    ],
  });
  return tx;
}
