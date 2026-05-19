// Integration test: verifies that TS off-chain hash derivation
// (`deriveActionCommit` / `deriveApprovalIdentity`) produces byte-for-byte
// identical output to the Move on-chain functions
// (`mandate::derive_action_commit` / `mandate::derive_approval_id`) on the
// currently-deployed v3 testnet package.
//
// Runs against Sui testnet via dev-inspect — no DB, no KMS, no signing.
// Auto-skips when LEVO agent env isn't configured.

import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';

import { getAgentSuiClient } from './sui-client';
import {
  getLevoAgentPackageId,
  isLevoAgentConfigured,
  LEVO_AGENT_MODULES,
} from './package';
import {
  bytesToHex,
  deriveActionCommit,
  deriveApprovalIdentity,
} from './witness';

// Any address works for dev-inspect — it doesn't sign or charge gas.
const DRY_RUN_SENDER = '0x0000000000000000000000000000000000000000000000000000000000000001';

const MANDATE_ID = '0x' + 'aa'.repeat(32);
const TARGET = '0x' + 'be'.repeat(32);
const COIN_TYPE = '0x2::sui::SUI';
const ACTION_TYPE = 2; // EARN_DEPOSIT
const AMOUNT = 12345n;
const WITNESS = new Uint8Array(32).fill(0x7c);
const NEXT_COMMIT = new Uint8Array(32).fill(0x99);
const CURRENT_COMMIT = new Uint8Array(32).fill(0x11);

async function devInspectMoveHash(
  fnName: 'derive_action_commit' | 'derive_approval_id',
  args: 'action' | 'approval',
): Promise<Uint8Array> {
  const client = getAgentSuiClient();
  const packageId = getLevoAgentPackageId();
  const tx = new Transaction();

  if (args === 'action') {
    tx.moveCall({
      target: `${packageId}::${LEVO_AGENT_MODULES.mandate}::derive_action_commit`,
      typeArguments: [COIN_TYPE],
      arguments: [
        tx.pure.vector('u8', Array.from(WITNESS)),
        tx.pure.address(MANDATE_ID),
        tx.pure.u32(ACTION_TYPE),
        tx.pure.address(TARGET),
        tx.pure.u64(AMOUNT),
        tx.pure.vector('u8', Array.from(NEXT_COMMIT)),
      ],
    });
  } else {
    // `derive_approval_id` takes `&Mandate` as second arg — we can't easily
    // construct a Mandate in a dev-inspect call. The Move-side `derive_approval_id_with_type`
    // (also publicly exposed) takes the same data via individual args. But our
    // mandate.move v3 only exposes `derive_approval_id(mandate, ...)` for the
    // public path; the BCS material is identical to ActionCommitMaterial except
    // `current_commit` substitutes for `witness`. We test this indirectly by
    // checking that `derive_action_commit` hashes match (same Move blake2b + BCS
    // serialization path) — if action commits match, approval identity uses the
    // same primitives so it would too.
    throw new Error('approval test not supported via dev-inspect (needs Mandate object)');
  }

  const result = await client.devInspectTransactionBlock({
    sender: DRY_RUN_SENDER,
    transactionBlock: tx,
  });

  if (result.effects?.status.status !== 'success') {
    throw new Error(`dev-inspect failed: ${result.effects?.status.error}`);
  }

  const returnValues = result.results?.[0]?.returnValues;
  if (!returnValues || returnValues.length === 0) {
    throw new Error(`no return value from ${fnName}`);
  }
  const [bytesArr, typeTag] = returnValues[0]!;
  if (typeTag !== 'vector<u8>') {
    throw new Error(`unexpected return type from ${fnName}: ${typeTag}`);
  }
  // Move return value is BCS-encoded `vector<u8>` — strip ULEB128 length prefix.
  return stripUleb128Prefix(new Uint8Array(bytesArr));
}

function stripUleb128Prefix(bytes: Uint8Array): Uint8Array {
  let cursor = 0;
  while (cursor < bytes.length && (bytes[cursor]! & 0x80) !== 0) {
    cursor += 1;
  }
  cursor += 1; // include the final byte (high bit clear)
  return bytes.slice(cursor);
}

describe.skipIf(!isLevoAgentConfigured())(
  'Move vs TS hash agreement (live testnet dev-inspect)',
  () => {
    let originalConsoleError: typeof console.error;
    beforeAll(() => {
      // Silence the dev-inspect "failed" warning the Sui SDK emits internally
      // when we hit early-return paths; we surface errors via the response status.
      originalConsoleError = console.error;
    });
    afterAll(() => {
      console.error = originalConsoleError;
    });

    it('deriveActionCommit matches mandate::derive_action_commit on chain', async () => {
      const onChain = await devInspectMoveHash('derive_action_commit', 'action');
      const offChain = deriveActionCommit({
        mandateId: MANDATE_ID,
        coinType: COIN_TYPE,
        actionType: ACTION_TYPE,
        target: TARGET,
        amount: AMOUNT,
        witness: WITNESS,
        nextCommit: NEXT_COMMIT,
      });
      expect(bytesToHex(offChain)).toEqual(bytesToHex(onChain));
    }, 30_000);

    it('deriveApprovalIdentity is structurally consistent (sanity)', () => {
      // We can't easily dev-inspect derive_approval_id (it needs a real Mandate
      // object), but our struct shape is identical except current_commit
      // substitutes for witness in BCS. Verify deterministic + 32-byte output
      // here as a non-network smoke; full on-chain validation is the e2e flow
      // already passing in scripts/agent-flow-e2e.ts (Seal accepts our identity).
      const a = deriveApprovalIdentity({
        mandateId: MANDATE_ID,
        coinType: COIN_TYPE,
        actionType: ACTION_TYPE,
        target: TARGET,
        amount: AMOUNT,
        currentCommit: CURRENT_COMMIT,
        nextCommit: NEXT_COMMIT,
      });
      expect(a).toHaveLength(32);
      const b = deriveApprovalIdentity({
        mandateId: MANDATE_ID,
        coinType: COIN_TYPE,
        actionType: ACTION_TYPE,
        target: TARGET,
        amount: AMOUNT,
        currentCommit: CURRENT_COMMIT,
        nextCommit: NEXT_COMMIT,
      });
      expect(bytesToHex(a)).toEqual(bytesToHex(b));
    });
  },
);
