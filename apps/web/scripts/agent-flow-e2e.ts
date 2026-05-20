// Full Phase 3b mandate-lifecycle e2e against testnet + dev DB.
//
//   create → initialize → execute (consume_witness) → revoke → destroy
//
// Bypasses Privy by signing owner transactions with a throwaway Ed25519 keypair
// directly. The route-level Privy 2-step flow is exercised through the
// shared `createMandate / initializeMandate / revokeMandate / destroyMandate`
// business-logic functions — only the wire-up to Privy's rawSign is mocked.
//
// Run:   pnpm tsx scripts/agent-flow-e2e.ts

import 'dotenv/config';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress, toBase64 } from '@mysten/sui/utils';

import {
  __submitOwnerTxWithSignature,
  createMandate,
  destroyMandate,
  finalizeCreateMandate,
  finalizeDestroyMandate,
  finalizeInitializeMandate,
  finalizeRevokeMandate,
  initializeMandate,
  loadOwnerWallet,
  revokeMandate,
} from '../lib/agent/mandate-flow';
import { executeNextStep } from '../lib/agent/executor';
import {
  AGENT_ACTION,
  getLevoAgentPackageId,
} from '../lib/agent/package';
import { getAgentSuiClient } from '../lib/agent/sui-client';
import { getAgentAddress, getAgentKeypair } from '../lib/agent/kms';
import type { MandateSpec, MandateSpecInput } from '../lib/agent/mandate-spec';
import { MandateSpecSchema } from '../lib/agent/mandate-spec';
import { prisma } from '../lib/prisma';
import { ActionTrigger, MandateStatus, UserAgentStatus } from '../lib/generated/prisma/client';

const ONE_DAY_MS = 86_400_000n;
const TEST_COIN_TYPE = '0x2::sui::SUI';
const E2E_TARGET = getRequiredE2ETargetAddress();

async function main() {
  console.log('== Phase 3b Mandate Flow E2E ==\n');
  const client = getAgentSuiClient();
  const packageId = getLevoAgentPackageId();
  const agentAddress = getAgentAddress();
  console.log('PackageID    :', packageId);
  console.log('Agent address:', agentAddress);

  // ----- Generate test owner (acts as a Privy-bound user) -----
  const ownerSeed = new Uint8Array(32);
  crypto.getRandomValues(ownerSeed);
  const owner = Ed25519Keypair.fromSecretKey(ownerSeed);
  const ownerAddress = owner.getPublicKey().toSuiAddress();
  const ownerPubBase64 = toBase64(owner.getPublicKey().toRawBytes());
  console.log('Owner address:', ownerAddress);

  // Upsert XUser row with the synthetic Privy binding so loadOwnerWallet works.
  const fakeXUserId = `e2e-${Date.now()}`;
  await prisma.xUser.upsert({
    where: { xUserId: fakeXUserId },
    create: {
      xUserId: fakeXUserId,
      username: `e2e_${fakeXUserId.slice(-8)}`,
      privyUserId: `e2e-privy-${fakeXUserId}`,
      privyWalletId: `e2e-wallet-${fakeXUserId}`,
      suiAddress: ownerAddress,
      suiPublicKey: ownerPubBase64,
    },
    update: {
      privyWalletId: `e2e-wallet-${fakeXUserId}`,
      suiAddress: ownerAddress,
      suiPublicKey: ownerPubBase64,
    },
  });
  const userAgent = await prisma.userAgent.create({
    data: {
      xUserId: fakeXUserId,
      agentAddress,
      label: 'E2E platform signer',
      status: UserAgentStatus.ACTIVE,
      isDefault: true,
    },
  });
  console.log('Test xUserId :', fakeXUserId, '\n');

  // ----- Fund owner from agent -----
  console.log('Funding owner from agent (0.05 SUI)...');
  await transferSuiFromAgent(client, ownerAddress, 50_000_000n);
  console.log('  funded\n');

  const ownerWallet = await loadOwnerWallet(fakeXUserId);

  // ----- Step 1: create mandate via createMandate (2-step bypassed by keypair) -----
  console.log('Step 1: createMandate (bypass Privy)...');
  // expiryMs is an absolute ms-since-epoch timestamp — not a duration.
  // Set to now + 1 day so create's `assert!(expiry > now)` passes.
  const expiryMs = BigInt(Date.now()) + ONE_DAY_MS;
  const specInput: MandateSpecInput = {
    agent: agentAddress,
    actions: AGENT_ACTION.EARN_DEPOSIT,
    coinLimits: [
      { coinType: TEST_COIN_TYPE, perTxCap: '1000', periodCap: '10000' },
    ],
    periodMs: ONE_DAY_MS.toString(),
    allowedTargets: [E2E_TARGET],
    expiryMs: expiryMs.toString(),
  };
  const spec: MandateSpec = MandateSpecSchema.parse(specInput);
  const plan = [
    {
      actionType: AGENT_ACTION.EARN_DEPOSIT,
      coinType: TEST_COIN_TYPE,
      target: E2E_TARGET,
      amount: 100n,
    },
  ];

  const prepared = await createMandate({
    owner: ownerWallet,
    userAgent,
    spec,
    plan,
    metadataName: 'E2E mandate',
  });
  if (prepared.status !== 'authorization_required') {
    throw new Error('expected authorization_required on first call');
  }
  const createTxBytes = Uint8Array.from(Buffer.from(prepared.txBytesBase64, 'base64'));
  const createSig = await owner.signTransaction(createTxBytes);
  const createResponse = await __submitOwnerTxWithSignature({
    txBytes: createTxBytes,
    signature: createSig.signature,
  });
  const created = await finalizeCreateMandate({
    input: {
      owner: ownerWallet,
      userAgent,
      spec,
      plan,
      metadataName: 'E2E mandate',
    },
    response: createResponse,
  });
  console.log('  status:        ', created.status);
  console.log('  mandate row:   ', created.mandateRowId);
  console.log('  mandate object:', created.mandateObjectId);
  console.log('  chain length:  ', created.witnessChainLength);
  console.log('  tx:            ', created.txDigest, '\n');

  // ----- Step 2: initializeMandate (bypass Privy) -----
  console.log('Step 2: initializeMandate (bypass Privy)...');
  const initPrep = await initializeMandate({
    owner: ownerWallet,
    mandateRowId: created.mandateRowId,
  });
  if (initPrep.status !== 'authorization_required') {
    throw new Error('expected authorization_required on init first call');
  }
  const initTxBytes = Uint8Array.from(Buffer.from(initPrep.txBytesBase64, 'base64'));
  const initSig = await owner.signTransaction(initTxBytes);
  const initResponse = await __submitOwnerTxWithSignature({
    txBytes: initTxBytes,
    signature: initSig.signature,
  });
  const initialized = await finalizeInitializeMandate({
    mandateRowId: created.mandateRowId,
    response: initResponse,
  });
  console.log('  status:        ', initialized.status);
  console.log('  witnessCommit: ', initialized.witnessCommit);
  console.log('  tx:            ', initialized.txDigest, '\n');

  // ----- Step 3: executeNextStep (agent KMS path) -----
  console.log('Step 3: executeNextStep (agent KMS consumes witness)...');
  const exec = await executeNextStep({
    mandateId: created.mandateRowId,
    trigger: ActionTrigger.SCHEDULED,
  });
  console.log('  status:', exec.status);
  if (exec.status !== 'confirmed') {
    throw new Error(`execute did not confirm: ${JSON.stringify(exec)}`);
  }
  console.log('  tx:           ', exec.txDigest);
  console.log('  action id:    ', exec.actionId);
  console.log('  witness id:   ', exec.witnessId);
  console.log('  nonce after:  ', exec.nonceAfter.toString(), '\n');

  // Verify DB state matches expectations.
  const witness = await prisma.agentWitness.findUnique({ where: { id: exec.witnessId } });
  if (!witness?.consumed) {
    throw new Error('AgentWitness.consumed not set');
  }
  const action = await prisma.agentAction.findUnique({ where: { id: exec.actionId } });
  if (action?.status !== 'CONFIRMED') {
    throw new Error(`AgentAction not CONFIRMED: ${action?.status}`);
  }

  // ----- Step 4: revokeMandate (bypass Privy) -----
  console.log('Step 4: revokeMandate (bypass Privy)...');
  const revokePrep = await revokeMandate({
    owner: ownerWallet,
    mandateRowId: created.mandateRowId,
  });
  if (revokePrep.status !== 'authorization_required') {
    throw new Error('expected authorization_required on revoke first call');
  }
  const revokeBytes = Uint8Array.from(Buffer.from(revokePrep.txBytesBase64, 'base64'));
  const revokeSig = await owner.signTransaction(revokeBytes);
  const revokeResponse = await __submitOwnerTxWithSignature({
    txBytes: revokeBytes,
    signature: revokeSig.signature,
  });
  const revoked = await finalizeRevokeMandate({
    mandateRowId: created.mandateRowId,
    response: revokeResponse,
  });
  console.log('  status:', revoked.status, '/', 'tx:', revoked.txDigest, '\n');

  const postRevoke = await prisma.agentMandate.findUnique({ where: { id: created.mandateRowId } });
  if (postRevoke?.status !== MandateStatus.REVOKED) {
    throw new Error(`mandate not REVOKED: ${postRevoke?.status}`);
  }

  // ----- Step 5: destroyMandate (bypass Privy; only allowed post-revoke/expiry) -----
  console.log('Step 5: destroyMandate (bypass Privy)...');
  const destroyPrep = await destroyMandate({
    owner: ownerWallet,
    mandateRowId: created.mandateRowId,
  });
  if (destroyPrep.status !== 'authorization_required') {
    throw new Error('expected authorization_required on destroy first call');
  }
  const destroyBytes = Uint8Array.from(Buffer.from(destroyPrep.txBytesBase64, 'base64'));
  const destroySig = await owner.signTransaction(destroyBytes);
  const destroyResponse = await __submitOwnerTxWithSignature({
    txBytes: destroyBytes,
    signature: destroySig.signature,
  });
  const destroyed = await finalizeDestroyMandate({
    mandateRowId: created.mandateRowId,
    response: destroyResponse,
  });
  console.log('  status:', destroyed.status, '/', 'tx:', destroyed.txDigest, '\n');

  console.log('All 5 lifecycle steps confirmed end-to-end against testnet + dev DB.');
  console.log('mandate row id: ', created.mandateRowId);
  console.log('mandate object: ', created.mandateObjectId);
}

async function transferSuiFromAgent(
  client: ReturnType<typeof getAgentSuiClient>,
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

function getRequiredE2ETargetAddress(): string {
  const target = process.env.LEVO_AGENT_E2E_TARGET_ADDRESS?.trim();
  if (!target) {
    throw new Error(
      'LEVO_AGENT_E2E_TARGET_ADDRESS must be set to a real StableLayer Earn account target before running agent-flow-e2e.ts',
    );
  }
  return normalizeSuiAddress(target);
}

main()
  .catch((err) => {
    console.error('E2E failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
