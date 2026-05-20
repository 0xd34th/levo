// One-shot smoke test for the agent crypto stack against the live Mysten testnet
// Seal committee. Run: `pnpm tsx scripts/agent-smoke.ts`
// Verifies that env vars are configured + SDK runs headlessly + the configured
// committee accepts our encryption request.

import 'dotenv/config';
import {
  bytesToHex,
  deriveActionCommit,
  deriveApprovalIdentity,
  generateWitness,
} from '../lib/agent/witness';
import { getAgentAddress } from '../lib/agent/kms';
import {
  encryptWitnessForAction,
  isSealConfigured,
} from '../lib/agent/seal-client';
import {
  AGENT_ACTION,
  getLevoAgentPackageId,
  isLevoAgentConfigured,
} from '../lib/agent/package';

const FAKE_MANDATE_ID = '0x' + 'aa'.repeat(32);
const FAKE_TARGET = '0x' + 'be'.repeat(32);
// Use the v2 testnet's TEST_USDC for the coin type tag (the package would have
// to actually publish a TEST_USDC for real flows; for the smoke test the type
// name string is all that matters since we never call any coin module).
const FAKE_COIN_TYPE = `${getLevoAgentPackageId()}::test_usdc::TEST_USDC`;

async function main() {
  console.log('== Agent crypto smoke test ==\n');

  console.log('Config:');
  console.log('  Levo agent configured:', isLevoAgentConfigured());
  console.log('  Seal configured:      ', isSealConfigured());
  console.log('  Agent address:        ', getAgentAddress());
  console.log('  Package ID:           ', getLevoAgentPackageId());
  console.log();

  // Phase 2 deterministic crypto — runs without network.
  const witness = generateWitness();
  const nextCommit = new Uint8Array(32).fill(0x99);
  const currentCommit = new Uint8Array(32).fill(0x11);

  const ctx = {
    mandateId: FAKE_MANDATE_ID,
    coinType: FAKE_COIN_TYPE,
    actionType: AGENT_ACTION.EARN_DEPOSIT,
    target: FAKE_TARGET,
    amount: 100n,
  };

  const commit = deriveActionCommit({ ...ctx, witness, nextCommit });
  const identity = deriveApprovalIdentity({ ...ctx, currentCommit, nextCommit });

  console.log('Derived (local, no network):');
  console.log('  witness        :', bytesToHex(witness));
  console.log('  action commit  :', bytesToHex(commit));
  console.log('  approval id    :', bytesToHex(identity));
  console.log();

  // Phase 2 live Seal call — hits the configured Mysten testnet aggregator.
  console.log('Encrypting via Seal committee...');
  const t0 = Date.now();
  const record = await encryptWitnessForAction({
    ...ctx,
    witness,
    currentCommit,
    nextCommit,
  });
  console.log(
    `  encryptedObject bytes : ${record.encryptedObject.length} (in ${Date.now() - t0} ms)`,
  );
  console.log(`  approval id hex       : ${record.approvalIdentityHex}`);
  console.log();
  console.log('OK — Seal stack works end-to-end.');
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exitCode = 1;
});
