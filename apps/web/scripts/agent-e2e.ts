// End-to-end test of the agent crypto + on-chain stack on Sui testnet.
// Validates: mandate creation → Seal encrypt → owner-only init → Seal decrypt
// → agent consume_witness → on-chain event parsing — all against the live v2
// levo-agent package.
//
// Runs entirely from this script (no Privy / Next.js — just raw Sui SDK + our
// lib/agent helpers). The "owner" is a fresh Ed25519 key generated per run;
// the "agent" is the LEVO_AGENT_SIGNER_SECRET_KEY in .env.
//
// Run:   pnpm tsx scripts/agent-e2e.ts
// Idempotency: each run creates a new mandate so re-running is safe.

import 'dotenv/config';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64, toBase64 } from '@mysten/sui/utils';

import { AGENT_ACTION, getEventType, getLevoAgentPackageId } from '../lib/agent/package';
import { getAgentSuiClient } from '../lib/agent/sui-client';
import { getAgentAddress, getAgentKeypair, signTransactionAsAgent } from '../lib/agent/kms';
import {
  buildCreateAndShareMandateTx,
  buildConsumeAndAuthorizeTx,
  buildSetInitialWitnessTx,
} from '../lib/agent/tx';
import { generateChainSteps } from '../lib/agent/chain';
import { decryptWitnessForAction } from '../lib/agent/seal-client';
import { bytesToHex, hexToBytes } from '../lib/agent/witness';

const ONE_DAY_MS = 86_400_000n;
const DUMMY_TARGET = '0x000000000000000000000000000000000000000000000000000000000000be11';
const TEST_COIN_TYPE = '0x2::sui::SUI'; // any TypeName works — mandate is audit-only per N-1.

async function main() {
  console.log('== Levo Agent E2E (testnet) ==\n');

  const client = getAgentSuiClient();
  const packageId = getLevoAgentPackageId();
  const agentAddress = getAgentAddress();

  console.log('PackageID    :', packageId);
  console.log('Agent address:', agentAddress);

  // ----- Generate a fresh owner key for this run -----
  const ownerSeed = new Uint8Array(32);
  crypto.getRandomValues(ownerSeed);
  const owner = Ed25519Keypair.fromSecretKey(ownerSeed);
  const ownerAddress = owner.getPublicKey().toSuiAddress();
  console.log('Owner address:', ownerAddress);
  console.log('Owner seed   :', toBase64(ownerSeed), '(throwaway)\n');

  // ----- Fund owner from agent (agent already funded by deployer earlier) -----
  // 0.05 SUI is plenty for owner's two txs (create + init); keeping it small
  // means each e2e run only burns ~0.05 SUI of agent funds.
  console.log('Funding owner from agent (0.05 SUI)...');
  await transferSuiFromAgent(client, ownerAddress, 50_000_000n);
  console.log('  funded\n');

  // ----- Step 1: owner creates + shares mandate -----
  console.log('Step 1: create + share mandate...');
  const now = BigInt(Date.now());
  const expiryMs = now + ONE_DAY_MS;
  const createTx = buildCreateAndShareMandateTx(
    {
      agent: agentAddress,
      actions: AGENT_ACTION.EARN_DEPOSIT,
      coinLimits: [
        {
          coinType: TEST_COIN_TYPE,
          perTxCap: 1_000n,
          periodCap: 10_000n,
        },
      ],
      periodMs: ONE_DAY_MS,
      allowedTargets: [DUMMY_TARGET],
      expiryMs,
    },
    packageId,
  );
  createTx.setSender(ownerAddress);
  const createTxBytes = await createTx.build({ client });
  const createSig = await owner.signTransaction(createTxBytes);
  const createResult = await client.executeTransactionBlock({
    transactionBlock: createTxBytes,
    signature: [createSig.signature],
    options: { showEffects: true, showEvents: true, showObjectChanges: true },
  });
  if (createResult.effects?.status.status !== 'success') {
    throw new Error(`create failed: ${createResult.effects?.status.error}`);
  }
  const mandateObjectId = extractMandateObjectId(createResult, packageId);
  console.log('  tx:           ', createResult.digest);
  console.log('  mandate id:   ', mandateObjectId, '\n');

  // ----- Step 2: pre-generate single-step chain via Seal -----
  console.log('Step 2: generate chain step + encrypt witness via Seal...');
  const chain = await generateChainSteps({
    mandateId: mandateObjectId,
    actions: [
      {
        actionType: AGENT_ACTION.EARN_DEPOSIT,
        coinType: TEST_COIN_TYPE,
        target: DUMMY_TARGET,
        amount: 100n,
      },
    ],
    packageId,
  });
  const step = chain[0]!;
  console.log('  currentCommit:', bytesToHex(step.currentCommit));
  console.log('  nextCommit:   ', bytesToHex(step.nextCommit));
  console.log('  approval id:  ', bytesToHex(step.approvalIdentity));
  console.log('  ciphertext:   ', step.encryptedObject.length, 'bytes\n');

  // ----- Step 3: owner sets initial witness (F-5 owner-only) -----
  console.log('Step 3: owner set_initial_witness...');
  const initTx = buildSetInitialWitnessTx(mandateObjectId, step.currentCommit, packageId);
  initTx.setSender(ownerAddress);
  const initBytes = await initTx.build({ client });
  const initSig = await owner.signTransaction(initBytes);
  const initResult = await client.executeTransactionBlock({
    transactionBlock: initBytes,
    signature: [initSig.signature],
    options: { showEffects: true, showEvents: true },
  });
  if (initResult.effects?.status.status !== 'success') {
    throw new Error(`init failed: ${initResult.effects?.status.error}`);
  }
  console.log('  tx:', initResult.digest, '\n');

  // ----- Step 3.5: dev-inspect seal_approve to diagnose any identity / policy mismatch -----
  console.log('Step 3.5: dev-inspect seal_approve to confirm PTB is valid...');
  const { buildSealApproveTx } = await import('../lib/agent/tx');
  const dryRunTx = buildSealApproveTx({
    identity: step.approvalIdentity,
    mandateId: mandateObjectId,
    coinType: TEST_COIN_TYPE,
    actionType: AGENT_ACTION.EARN_DEPOSIT,
    target: DUMMY_TARGET,
    amount: 100n,
    nextCommit: step.nextCommit,
  });
  // devInspect accepts a Transaction directly; pre-building consumes a gas object
  // which our agent doesn't need to pay for read-only inspection.
  const dryRun = await client.devInspectTransactionBlock({
    sender: agentAddress,
    transactionBlock: dryRunTx,
  });
  console.log('  status:', dryRun.effects?.status.status);
  if (dryRun.effects?.status.status !== 'success') {
    console.log('  error:', dryRun.effects?.status.error);
    // Read on-chain witness_commit to confirm what state seal_approve sees
    const obj = await client.getObject({
      id: mandateObjectId,
      options: { showContent: true },
    });
    const fields = (obj.data?.content as { fields?: Record<string, unknown> })?.fields;
    console.log('  on-chain witness_commit:', formatCommit(fields?.witness_commit));
    console.log('  off-chain expected     :', bytesToHex(step.currentCommit));
    throw new Error('seal_approve dry-run failed locally');
  }
  console.log('  seal_approve dry-run passes locally\n');

  // ----- Step 4: agent decrypts witness via Seal (dry-runs seal_approve) -----
  console.log('Step 4: Seal decrypt (committee dry-runs seal_approve against live mandate)...');
  const t0 = Date.now();
  const witnessPreimage = await decryptWitnessForAction({
    mandateId: mandateObjectId,
    coinType: TEST_COIN_TYPE,
    actionType: AGENT_ACTION.EARN_DEPOSIT,
    target: DUMMY_TARGET,
    amount: 100n,
    approvalIdentity: step.approvalIdentity,
    nextCommit: step.nextCommit,
    encryptedObject: step.encryptedObject,
  });
  console.log(`  decrypted ${witnessPreimage.length} bytes in ${Date.now() - t0} ms`);
  console.log('  witness:    ', bytesToHex(witnessPreimage), '\n');

  // ----- Step 5: agent consumes witness in a single PTB -----
  console.log('Step 5: agent consume_witness + authorize_earn_deposit...');
  const consumeTx = buildConsumeAndAuthorizeTx(
    {
      mandateId: mandateObjectId,
      coinType: TEST_COIN_TYPE,
      action: AGENT_ACTION.EARN_DEPOSIT,
      target: DUMMY_TARGET,
      amount: 100n,
      witness: witnessPreimage,
      nextCommit: step.nextCommit,
    },
    packageId,
  );
  consumeTx.setSender(agentAddress);
  const consumeBytes = await consumeTx.build({ client });
  const { signature: consumeSig } = await signTransactionAsAgent(consumeBytes);
  const consumeResult = await client.executeTransactionBlock({
    transactionBlock: consumeBytes,
    signature: [consumeSig],
    options: { showEffects: true, showEvents: true },
  });
  if (consumeResult.effects?.status.status !== 'success') {
    throw new Error(`consume failed: ${consumeResult.effects?.status.error}`);
  }
  console.log('  tx:', consumeResult.digest);

  const witnessConsumedType = getEventType('witnessConsumed', packageId);
  const consumed = consumeResult.events?.find((e) => e.type === witnessConsumedType);
  if (!consumed) {
    throw new Error('WitnessConsumed event not found in tx response');
  }
  const parsed = consumed.parsedJson as Record<string, unknown>;
  console.log('  event nonce:           ', parsed.nonce);
  console.log('  event commit_before:   ', formatCommit(parsed.witness_commit_before));
  console.log('  event commit_after:    ', formatCommit(parsed.witness_commit_after));

  // Sanity: chain advanced exactly one step.
  if (Number(parsed.nonce) !== 2) {
    throw new Error(`expected nonce=2 (init=1 + 1 rotate); got ${parsed.nonce}`);
  }
  const expectedAfter = bytesToHex(step.nextCommit);
  const actualAfter = formatCommit(parsed.witness_commit_after);
  if (actualAfter !== expectedAfter) {
    throw new Error(`commit_after mismatch: expected ${expectedAfter}, got ${actualAfter}`);
  }

  console.log('\nOK — full crypto + on-chain stack works end-to-end.');
  console.log('  mandate object: ', mandateObjectId);
  console.log('  consume tx:     ', consumeResult.digest);
}

function formatCommit(commit: unknown): string {
  if (Array.isArray(commit)) {
    return `0x${commit.map((b) => (b as number).toString(16).padStart(2, '0')).join('')}`;
  }
  if (typeof commit === 'string') {
    return commit.startsWith('0x') ? commit : `0x${commit}`;
  }
  throw new Error(`unsupported commit encoding: ${typeof commit}`);
}

async function transferSuiFromAgent(
  client: Awaited<ReturnType<typeof getAgentSuiClient>>,
  to: string,
  amountMist: bigint,
): Promise<void> {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [amountMist]);
  tx.transferObjects([coin!], to);
  const kp = getAgentKeypair();
  tx.setSender(kp.getPublicKey().toSuiAddress());
  const bytes = await tx.build({ client });
  const { signature } = await kp.signTransaction(bytes);
  const res = await client.executeTransactionBlock({
    transactionBlock: bytes,
    signature: [signature],
    options: { showEffects: true },
  });
  if (res.effects?.status.status !== 'success') {
    throw new Error(`agent → owner transfer failed: ${res.effects?.status.error}`);
  }
}

function extractMandateObjectId(
  result: Awaited<ReturnType<ReturnType<typeof getAgentSuiClient>['executeTransactionBlock']>>,
  packageId: string,
): string {
  const createdType = getEventType('mandateCreated', packageId);
  const event = result.events?.find((e) => e.type === createdType);
  if (event) {
    const parsed = event.parsedJson as { mandate_id?: string };
    if (parsed.mandate_id) return parsed.mandate_id;
  }
  // Fallback: find the created shared Mandate object.
  const mandate = result.objectChanges?.find(
    (c) => c.type === 'created' && c.objectType?.endsWith('::mandate::Mandate'),
  ) as { objectId?: string } | undefined;
  if (mandate?.objectId) return mandate.objectId;
  throw new Error('mandate object id not found in tx response');
}

// Silence "unused var" if a dev tweaks the script and stops using fromBase64.
void fromBase64;

main().catch((err) => {
  console.error('E2E failed:', err);
  process.exitCode = 1;
});
