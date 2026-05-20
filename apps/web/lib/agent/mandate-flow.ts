import type {
  SuiTransactionBlockResponse,
  SuiEvent,
} from '@mysten/sui/jsonRpc';
import {
  MandateStatus,
  type AgentMandate,
  type UserAgent,
} from '@/lib/generated/prisma/client';
import { hasValidHmacSecret } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import type { PrivyAuthorizationRequest } from '@/lib/privy-authorization';
import { getPrivyClient } from '@/lib/privy-auth';
import {
  buildPrivyRawSignAuthorizationRequest,
  signSuiTransaction,
} from '@/lib/privy-wallet';
import {
  markMandateDestroyed,
  markMandateRevoked,
} from './audit';
import {
  generateChainSteps,
  type PlannedAction,
} from './chain';
import {
  AGENT_ACTION,
  getEventType,
  getLevoAgentPackageId,
} from './package';
import { getAgentSuiClient } from './sui-client';
import {
  buildCreateAndShareMandateTx,
  buildDestroyTerminatedTx,
  buildRevokeMandateTx,
  buildSetInitialWitnessTx,
} from './tx';
import {
  hashOwnerTxRequest,
  issueOwnerTxIntent,
  verifyOwnerTxIntent,
  type OwnerTxIntentBinding,
  type OwnerTxOperation,
} from './tx-intent';
import { type MandateSpec } from './types';
import { bytesToHex, hexToBytes } from './witness';

// The owner wallet binding required to sign mandate-lifecycle transactions
// (create / initialize / revoke / destroy). Loaded from XUser.
export interface OwnerWallet {
  xUserId: string;
  privyWalletId: string;
  suiAddress: string;
  suiPublicKey: string;
}

export async function loadOwnerWallet(xUserId: string): Promise<OwnerWallet> {
  const xUser = await prisma.xUser.findUnique({ where: { xUserId } });
  if (!xUser?.privyWalletId || !xUser.suiAddress || !xUser.suiPublicKey) {
    throw new Error(
      'Wallet not set up. Complete /api/v1/wallet/setup before creating a mandate.',
    );
  }
  return {
    xUserId,
    privyWalletId: xUser.privyWalletId,
    suiAddress: xUser.suiAddress,
    suiPublicKey: xUser.suiPublicKey,
  };
}

// ---------- Privy 2-step signing helpers ----------

// Server-side: take the owner's Privy authorization signature + the raw tx bytes
// returned in the prior call, ask Privy to sign the Sui tx, then submit it.
// Waits for RPC indexing so downstream reads (executor.readOnChainWitnessCommit)
// see the post-tx state.
async function signAndSubmitOwnerTx(args: {
  owner: OwnerWallet;
  txBytes: Uint8Array;
  authorizationSignature: string;
}): Promise<SuiTransactionBlockResponse> {
  const privy = getPrivyClient();
  const userSignature = await signSuiTransaction(
    privy,
    args.owner.privyWalletId,
    args.owner.suiPublicKey,
    args.txBytes,
    { signatures: [args.authorizationSignature] },
  );
  const client = getAgentSuiClient();
  const response = await client.executeTransactionBlock({
    transactionBlock: args.txBytes,
    signature: [userSignature],
    options: { showEffects: true, showEvents: true, showObjectChanges: true },
  });
  await client.waitForTransaction({ digest: response.digest });
  return response;
}

// Test-only escape hatch — used by `scripts/agent-flow-e2e.ts` to exercise the
// flow without Privy by signing with a raw Ed25519 keypair. Not exposed to routes.
export async function __submitOwnerTxWithSignature(args: {
  txBytes: Uint8Array;
  signature: string;
}): Promise<SuiTransactionBlockResponse> {
  const client = getAgentSuiClient();
  const response = await client.executeTransactionBlock({
    transactionBlock: args.txBytes,
    signature: [args.signature],
    options: { showEffects: true, showEvents: true, showObjectChanges: true },
  });
  await client.waitForTransaction({ digest: response.digest });
  return response;
}

// ---------- create ----------

export interface CreateMandateInput {
  owner: OwnerWallet;
  userAgent: Pick<UserAgent, 'id' | 'agentAddress'>;
  spec: MandateSpec;
  plan: PlannedAction[];
  metadataName?: string;
  // When omitted, returns auth_required. When present, server submits and persists.
  authorizationSignature?: string;
  txBytesBase64?: string;
  txIntent?: string;
}

export type CreateMandateOutput =
  | {
      status: 'authorization_required';
      authorizationRequest: PrivyAuthorizationRequest;
      txBytesBase64: string;
      txIntent: string;
    }
  | {
      status: 'confirmed';
      txDigest: string;
      mandateRowId: string;
      mandateObjectId: string;
      witnessChainLength: number;
      // Pre-built bytes for the next step (set_initial_witness) so the client can
      // immediately ask Privy for another authorization without an extra server hop.
      initAuthorizationRequest: PrivyAuthorizationRequest;
      initTxBytesBase64: string;
      initTxIntent: string;
    };

export async function createMandate(input: CreateMandateInput): Promise<CreateMandateOutput> {
  const client = getAgentSuiClient();

  // First call: build tx, hand back authorization request.
  if (!input.authorizationSignature || !input.txBytesBase64) {
    const tx = buildCreateAndShareMandateTx(input.spec);
    tx.setSender(input.owner.suiAddress);
    const txBytes = await tx.build({ client });
    const txBytesBase64 = Buffer.from(txBytes).toString('base64');
    return {
      status: 'authorization_required',
      authorizationRequest: buildPrivyRawSignAuthorizationRequest(
        input.owner.privyWalletId,
        txBytes,
      ),
      txBytesBase64,
      txIntent: issueOwnerTxIntent(
        buildCreateTxIntentBinding(input, txBytesBase64),
        getOwnerTxIntentSecret(),
      ),
    };
  }

  // Second call: submit + persist.
  assertOwnerTxIntent(
    input.txIntent,
    buildCreateTxIntentBinding(input, input.txBytesBase64),
  );
  const txBytes = Uint8Array.from(Buffer.from(input.txBytesBase64, 'base64'));
  const response = await signAndSubmitOwnerTx({
    owner: input.owner,
    txBytes,
    authorizationSignature: input.authorizationSignature,
  });
  return finalizeCreateMandate({ input, response });
}

// Shared finalization path — also used by the test-only flow that signs with a
// raw keypair instead of Privy. After this returns, the mandate is on-chain
// and the witness chain (one ciphertext per planned action) is persisted in DB,
// but `witness_commit` on the mandate object is still empty (owner has not yet
// called set_initial_witness).
export async function finalizeCreateMandate(args: {
  input: Omit<CreateMandateInput, 'authorizationSignature' | 'txBytesBase64' | 'txIntent'>;
  response: SuiTransactionBlockResponse;
}): Promise<Extract<CreateMandateOutput, { status: 'confirmed' }>> {
  const { input, response } = args;
  if (response.effects?.status.status !== 'success') {
    throw new Error(`mandate::create failed: ${response.effects?.status.error}`);
  }
  const mandateObjectId = extractMandateObjectId(response);

  // Single transaction wraps DB inserts so a failure here doesn't leave a
  // half-written mandate / partial witness chain.
  const { mandate, chainLength } = await prisma.$transaction(async (tx) => {
    const mandate = await tx.agentMandate.create({
      data: {
        xUserId: input.owner.xUserId,
        userAgentId: input.userAgent.id,
        agentAddress: input.userAgent.agentAddress,
        mandateObjectId,
        name: input.metadataName ?? 'Agent mandate',
        actions: input.spec.actions,
        coinLimits: serializeCoinLimits(input.spec.coinLimits),
        periodMs: input.spec.periodMs,
        allowedTargets: input.spec.allowedTargets,
        expiryMs: input.spec.expiryMs,
        metadata: input.spec.metadata ?? {},
        status: MandateStatus.ACTIVE, // witness_commit is null until owner inits
        createdTxDigest: response.digest,
        witnessCommit: null,
      },
    });

    const chain = await generateChainSteps({
      mandateId: mandateObjectId,
      actions: input.plan,
    });
    await tx.agentWitness.createMany({
      data: chain.map((step) => ({
        mandateId: mandate.id,
        chainIndex: step.chainIndex,
        actionType: step.actionType,
        coinType: step.coinType,
        amount: step.amount.toString(),
        target: step.target,
        currentCommit: bytesToHex(step.currentCommit),
        nextCommit: bytesToHex(step.nextCommit),
        approvalIdentity: bytesToHex(step.approvalIdentity),
        encryptedObject: Buffer.from(step.encryptedObject),
      })),
    });
    return { mandate, chainLength: chain.length };
  });

  // Pre-build init tx so the next client call (initializeMandate) has the bytes
  // ready and the user only needs one extra Privy signature.
  const initTx = buildSetInitialWitnessTx(
    mandate.mandateObjectId,
    hexToBytes(await getInitialCommit(mandate.id)),
  );
  initTx.setSender(input.owner.suiAddress);
  const initBytes = await initTx.build({ client: getAgentSuiClient() });
  const initTxBytesBase64 = Buffer.from(initBytes).toString('base64');

  return {
    status: 'confirmed',
    txDigest: response.digest,
    mandateRowId: mandate.id,
    mandateObjectId,
    witnessChainLength: chainLength,
    initAuthorizationRequest: buildPrivyRawSignAuthorizationRequest(
      input.owner.privyWalletId,
      initBytes,
    ),
    initTxBytesBase64,
    initTxIntent: issueOwnerTxIntent(
      buildMandateTxIntentBinding({
        operation: 'initialize',
        owner: input.owner,
        mandate,
        txBytesBase64: initTxBytesBase64,
      }),
      getOwnerTxIntentSecret(),
    ),
  };
}

// ---------- initialize ----------

export interface InitializeMandateInput {
  owner: OwnerWallet;
  mandateRowId: string;
  authorizationSignature?: string;
  txBytesBase64?: string;
  txIntent?: string;
}

export type InitializeMandateOutput =
  | {
      status: 'authorization_required';
      authorizationRequest: PrivyAuthorizationRequest;
      txBytesBase64: string;
      txIntent: string;
    }
  | {
      status: 'confirmed';
      txDigest: string;
      witnessCommit: string;
    };

export async function initializeMandate(
  input: InitializeMandateInput,
): Promise<InitializeMandateOutput> {
  const mandate = await loadMandateOwned(input.owner.xUserId, input.mandateRowId);
  if (mandate.witnessCommit) {
    throw new Error('Mandate already initialized');
  }
  const client = getAgentSuiClient();

  if (!input.authorizationSignature || !input.txBytesBase64) {
    const commitHex = await getInitialCommit(mandate.id);
    const tx = buildSetInitialWitnessTx(mandate.mandateObjectId, hexToBytes(commitHex));
    tx.setSender(input.owner.suiAddress);
    const bytes = await tx.build({ client });
    const txBytesBase64 = Buffer.from(bytes).toString('base64');
    return {
      status: 'authorization_required',
      authorizationRequest: buildPrivyRawSignAuthorizationRequest(
        input.owner.privyWalletId,
        bytes,
      ),
      txBytesBase64,
      txIntent: issueOwnerTxIntent(
        buildMandateTxIntentBinding({
          operation: 'initialize',
          owner: input.owner,
          mandate,
          txBytesBase64,
        }),
        getOwnerTxIntentSecret(),
      ),
    };
  }

  assertOwnerTxIntent(
    input.txIntent,
    buildMandateTxIntentBinding({
      operation: 'initialize',
      owner: input.owner,
      mandate,
      txBytesBase64: input.txBytesBase64,
    }),
  );
  const txBytes = Uint8Array.from(Buffer.from(input.txBytesBase64, 'base64'));
  const response = await signAndSubmitOwnerTx({
    owner: input.owner,
    txBytes,
    authorizationSignature: input.authorizationSignature,
  });
  return finalizeInitializeMandate({ mandateRowId: mandate.id, response });
}

export async function finalizeInitializeMandate(args: {
  mandateRowId: string;
  response: SuiTransactionBlockResponse;
}): Promise<Extract<InitializeMandateOutput, { status: 'confirmed' }>> {
  if (args.response.effects?.status.status !== 'success') {
    throw new Error(`set_initial_witness failed: ${args.response.effects?.status.error}`);
  }
  const witnessCommit = await getInitialCommit(args.mandateRowId);
  await prisma.agentMandate.update({
    where: { id: args.mandateRowId },
    data: {
      witnessCommit,
      initTxDigest: args.response.digest,
      nonce: 1n, // mandate.move increments nonce on init
    },
  });
  return {
    status: 'confirmed',
    txDigest: args.response.digest,
    witnessCommit,
  };
}

// ---------- revoke ----------

export interface RevokeMandateInput {
  owner: OwnerWallet;
  mandateRowId: string;
  authorizationSignature?: string;
  txBytesBase64?: string;
  txIntent?: string;
}

export type RevokeMandateOutput =
  | {
      status: 'authorization_required';
      authorizationRequest: PrivyAuthorizationRequest;
      txBytesBase64: string;
      txIntent: string;
    }
  | {
      status: 'confirmed';
      txDigest: string;
    };

export async function revokeMandate(input: RevokeMandateInput): Promise<RevokeMandateOutput> {
  const mandate = await loadMandateOwned(input.owner.xUserId, input.mandateRowId);
  if (mandate.status === MandateStatus.REVOKED) {
    throw new Error('Mandate already revoked');
  }
  const client = getAgentSuiClient();

  if (!input.authorizationSignature || !input.txBytesBase64) {
    const tx = buildRevokeMandateTx(mandate.mandateObjectId);
    tx.setSender(input.owner.suiAddress);
    const bytes = await tx.build({ client });
    const txBytesBase64 = Buffer.from(bytes).toString('base64');
    return {
      status: 'authorization_required',
      authorizationRequest: buildPrivyRawSignAuthorizationRequest(
        input.owner.privyWalletId,
        bytes,
      ),
      txBytesBase64,
      txIntent: issueOwnerTxIntent(
        buildMandateTxIntentBinding({
          operation: 'revoke',
          owner: input.owner,
          mandate,
          txBytesBase64,
        }),
        getOwnerTxIntentSecret(),
      ),
    };
  }

  assertOwnerTxIntent(
    input.txIntent,
    buildMandateTxIntentBinding({
      operation: 'revoke',
      owner: input.owner,
      mandate,
      txBytesBase64: input.txBytesBase64,
    }),
  );
  const txBytes = Uint8Array.from(Buffer.from(input.txBytesBase64, 'base64'));
  const response = await signAndSubmitOwnerTx({
    owner: input.owner,
    txBytes,
    authorizationSignature: input.authorizationSignature,
  });
  return finalizeRevokeMandate({ mandateRowId: mandate.id, response });
}

export async function finalizeRevokeMandate(args: {
  mandateRowId: string;
  response: SuiTransactionBlockResponse;
}): Promise<Extract<RevokeMandateOutput, { status: 'confirmed' }>> {
  if (args.response.effects?.status.status !== 'success') {
    throw new Error(`revoke failed: ${args.response.effects?.status.error}`);
  }
  await markMandateRevoked({
    mandateId: args.mandateRowId,
    txDigest: args.response.digest,
  });
  return { status: 'confirmed', txDigest: args.response.digest };
}

// ---------- destroy ----------

export type DestroyMandateInput = RevokeMandateInput;
export type DestroyMandateOutput = RevokeMandateOutput;

export async function destroyMandate(input: DestroyMandateInput): Promise<DestroyMandateOutput> {
  const mandate = await loadMandateOwned(input.owner.xUserId, input.mandateRowId);
  if (mandate.status === MandateStatus.DESTROYED) {
    throw new Error('Mandate already destroyed');
  }
  const client = getAgentSuiClient();

  if (!input.authorizationSignature || !input.txBytesBase64) {
    const tx = buildDestroyTerminatedTx(mandate.mandateObjectId);
    tx.setSender(input.owner.suiAddress);
    const bytes = await tx.build({ client });
    const txBytesBase64 = Buffer.from(bytes).toString('base64');
    return {
      status: 'authorization_required',
      authorizationRequest: buildPrivyRawSignAuthorizationRequest(
        input.owner.privyWalletId,
        bytes,
      ),
      txBytesBase64,
      txIntent: issueOwnerTxIntent(
        buildMandateTxIntentBinding({
          operation: 'destroy',
          owner: input.owner,
          mandate,
          txBytesBase64,
        }),
        getOwnerTxIntentSecret(),
      ),
    };
  }

  assertOwnerTxIntent(
    input.txIntent,
    buildMandateTxIntentBinding({
      operation: 'destroy',
      owner: input.owner,
      mandate,
      txBytesBase64: input.txBytesBase64,
    }),
  );
  const txBytes = Uint8Array.from(Buffer.from(input.txBytesBase64, 'base64'));
  const response = await signAndSubmitOwnerTx({
    owner: input.owner,
    txBytes,
    authorizationSignature: input.authorizationSignature,
  });
  return finalizeDestroyMandate({ mandateRowId: mandate.id, response });
}

export async function finalizeDestroyMandate(args: {
  mandateRowId: string;
  response: SuiTransactionBlockResponse;
}): Promise<Extract<DestroyMandateOutput, { status: 'confirmed' }>> {
  if (args.response.effects?.status.status !== 'success') {
    throw new Error(`destroy failed: ${args.response.effects?.status.error}`);
  }
  await markMandateDestroyed({
    mandateId: args.mandateRowId,
    txDigest: args.response.digest,
  });
  return { status: 'confirmed', txDigest: args.response.digest };
}

// ---------- shared helpers ----------

async function loadMandateOwned(
  xUserId: string,
  mandateRowId: string,
): Promise<AgentMandate> {
  const mandate = await prisma.agentMandate.findFirst({
    where: { id: mandateRowId, xUserId },
  });
  if (!mandate) {
    throw new Error('Mandate not found');
  }
  return mandate;
}

async function getInitialCommit(mandateRowId: string): Promise<string> {
  const step = await prisma.agentWitness.findFirst({
    where: { mandateId: mandateRowId, chainIndex: 0 },
  });
  if (!step) {
    throw new Error('No chain steps generated for this mandate');
  }
  return step.currentCommit;
}

function serializeCoinLimits(coinLimits: MandateSpec['coinLimits']) {
  return coinLimits.map((c) => ({
    coinType: c.coinType,
    perTxCap: c.perTxCap.toString(),
    periodCap: c.periodCap.toString(),
    periodSpent: '0',
    periodStartMs: '0', // populated lazily via the on-chain object if needed
  }));
}

function buildCreateTxIntentBinding(
  input: Pick<CreateMandateInput, 'owner' | 'spec' | 'plan' | 'metadataName'>,
  txBytesBase64: string,
): OwnerTxIntentBinding {
  return {
    operation: 'create',
    ownerXUserId: input.owner.xUserId,
    ownerAddress: input.owner.suiAddress,
    txBytesBase64,
    requestHash: hashOwnerTxRequest({
      spec: input.spec,
      plan: input.plan,
      metadataName: input.metadataName ?? null,
    }),
  };
}

function buildMandateTxIntentBinding(args: {
  operation: Exclude<OwnerTxOperation, 'create'>;
  owner: OwnerWallet;
  mandate: Pick<AgentMandate, 'id' | 'mandateObjectId'>;
  txBytesBase64: string;
}): OwnerTxIntentBinding {
  return {
    operation: args.operation,
    ownerXUserId: args.owner.xUserId,
    ownerAddress: args.owner.suiAddress,
    mandateRowId: args.mandate.id,
    mandateObjectId: args.mandate.mandateObjectId,
    txBytesBase64: args.txBytesBase64,
  };
}

function assertOwnerTxIntent(
  txIntent: string | undefined,
  binding: OwnerTxIntentBinding,
) {
  const verified = verifyOwnerTxIntent(
    txIntent,
    binding,
    getOwnerTxIntentSecret(),
  );
  if (!verified.ok) {
    throw new Error(
      `Owner transaction authorization does not match this mandate operation: ${verified.reason}`,
    );
  }
}

function getOwnerTxIntentSecret(): string {
  const secret = process.env.HMAC_SECRET;
  if (!hasValidHmacSecret(secret)) {
    throw new Error('Server configuration error: HMAC_SECRET is not configured');
  }
  return secret;
}

function extractMandateObjectId(response: SuiTransactionBlockResponse): string {
  const mandateCreated = getEventType('mandateCreated');
  const event = (response.events ?? []).find((e: SuiEvent) => e.type === mandateCreated);
  if (event) {
    const parsed = event.parsedJson as { mandate_id?: string };
    if (parsed.mandate_id) return parsed.mandate_id;
  }
  const created = (response.objectChanges ?? []).find(
    (c) => c.type === 'created' && (c as { objectType?: string }).objectType?.endsWith('::mandate::Mandate'),
  ) as { objectId?: string } | undefined;
  if (created?.objectId) return created.objectId;
  throw new Error('Created Mandate object not found in transaction response');
}

// Surface the package id at the call site for routes that want to log it.
export function flowPackageId(): string {
  return getLevoAgentPackageId();
}

// Tiny utility re-export so route files can build EARN_DEPOSIT etc without
// reaching across two modules.
export const ACTION = AGENT_ACTION;
