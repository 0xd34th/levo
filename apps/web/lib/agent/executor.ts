import type { AgentMandate, AgentWitness } from '@/lib/generated/prisma/client';
import { ActionTrigger } from '@/lib/generated/prisma/client';
import { getGasStationKeypair } from '@/lib/gas-station';
import { prisma } from '@/lib/prisma';
import {
  createPendingAction,
  extractWitnessConsumed,
  markActionConfirmed,
  markActionFailed,
} from './audit';
import { signTransactionAsAgent } from './kms';
import { decryptWitnessForAction } from './seal-client';
import { getAgentSuiClient } from './sui-client';
import { buildConsumeAndAuthorizeTx } from './tx';
import { bytesToHex, hexToBytes } from './witness';
import { getMandateExecutionBlockReason } from './execution-guard';

export type ExecuteOutcome =
  | {
      status: 'confirmed';
      txDigest: string;
      actionId: string;
      witnessId: string;
      nonceAfter: bigint;
    }
  | { status: 'blocked_by_seal'; reason: string; actionId: string }
  | { status: 'failed'; reason: string; actionId: string }
  | { status: 'no_steps_pending'; mandateId: string };

interface MandateWithWitness extends AgentMandate {
  agentWitnesses: AgentWitness[];
}

/**
 * Execute the next unconsumed witness chain step for a mandate. Signs with the
 * agent KMS key (must equal mandate.agent on-chain) and submits a PTB that
 * chains `consume_witness<C>` → `authorize_earn_<deposit|withdraw|harvest><C>`.
 *
 * Side effects (DB):
 *   - Creates an AgentAction row in PENDING status before submission
 *   - On success: marks witness consumed + action CONFIRMED with parsed event fields
 *   - On Seal denial: marks action BLOCKED_BY_SEAL (witness stays unconsumed)
 *   - On chain rejection: marks action FAILED (witness stays unconsumed; manual review)
 *
 * Caller (cron worker or chat tool) is responsible for outer-loop locking; this
 * function does not acquire Redis locks itself.
 */
export async function executeNextStep(args: {
  mandateId: string;
  trigger: ActionTrigger;
}): Promise<ExecuteOutcome> {
  const mandate = await prisma.agentMandate.findUnique({
    where: { id: args.mandateId },
    include: {
      agentWitnesses: {
        where: { consumed: false },
        orderBy: { chainIndex: 'asc' },
        take: 1,
      },
    },
  });

  if (!mandate) {
    return { status: 'failed', reason: 'mandate not found', actionId: '' };
  }

  const blockedReason = getMandateExecutionBlockReason(mandate, Date.now());
  if (blockedReason) {
    return { status: 'failed', reason: blockedReason, actionId: '' };
  }

  const step = (mandate as MandateWithWitness).agentWitnesses[0];
  if (!step) {
    return { status: 'no_steps_pending', mandateId: mandate.id };
  }

  // Optimistic chain-state check: confirm on-chain witness_commit still matches
  // what this step was built for. Any drift means another runner already advanced
  // the chain (or the chain was tampered with).
  const onChainCommit = await readOnChainWitnessCommit(mandate.mandateObjectId);
  if (onChainCommit !== step.currentCommit) {
    return {
      status: 'failed',
      reason: `on-chain witness_commit drift: have ${onChainCommit}, expected ${step.currentCommit}`,
      actionId: '',
    };
  }

  // Record intent in audit before doing anything externally-visible.
  const action = await createPendingAction({
    mandateId: mandate.id,
    xUserId: mandate.xUserId,
    actionType: step.actionType,
    coinType: step.coinType,
    amount: BigInt(step.amount),
    target: step.target,
    trigger: args.trigger,
    sealApproved: false,
  });

  // 1) Ask Seal to release the witness preimage. The committee dry-runs
  //    `seal_approve(...)` against the live mandate; failure here means the
  //    on-chain policy itself rejects this action (revoked, expired, over-cap,
  //    target mismatch, etc.) — not a bug in our code path.
  let witness: Uint8Array;
  try {
    witness = await decryptWitnessForAction({
      mandateId: mandate.mandateObjectId,
      coinType: step.coinType,
      actionType: step.actionType,
      target: step.target,
      amount: BigInt(step.amount),
      approvalIdentity: hexToBytes(step.approvalIdentity),
      nextCommit: hexToBytes(step.nextCommit),
      encryptedObject: Uint8Array.from(step.encryptedObject),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'seal decrypt failed';
    await markActionFailed({ actionId: action.id, errorReason: reason, blockedBySeal: true });
    return { status: 'blocked_by_seal', reason, actionId: action.id };
  }

  // Mark seal_approved=true now that Seal granted the witness — even if the
  // on-chain submission later fails, the policy was satisfied at this moment.
  await prisma.agentAction.update({
    where: { id: action.id },
    data: { sealApproved: true },
  });

  // 2) Build + sign + submit the consume_witness + authorize PTB.
  //
  // Gas sponsorship: when GAS_STATION_SECRET_KEY is configured AND the gas
  // station is a different address from the agent, sponsor agent gas via the
  // standard Sui sponsored-transaction pattern (sender signs the tx, gas owner
  // also signs; Sui verifies both signatures). Falls back to agent-paid gas if
  // the station isn't configured or coincides with the agent.
  const client = getAgentSuiClient();
  const agentAddress = await agentAddressForTx();
  const gasStation = getGasStationKeypair();
  const useSponsor = gasStation !== null && gasStation.toSuiAddress() !== agentAddress;

  const tx = buildConsumeAndAuthorizeTx({
    mandateId: mandate.mandateObjectId,
    coinType: step.coinType,
    action: step.actionType,
    target: step.target,
    amount: BigInt(step.amount),
    witness,
    nextCommit: hexToBytes(step.nextCommit),
  });
  tx.setSender(agentAddress);
  if (useSponsor && gasStation) {
    tx.setGasOwner(gasStation.toSuiAddress());
  }

  let txBytes: Uint8Array;
  try {
    txBytes = await tx.build({ client });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'tx build failed';
    await markActionFailed({ actionId: action.id, errorReason: reason });
    return { status: 'failed', reason, actionId: action.id };
  }

  const { signature: agentSig } = await signTransactionAsAgent(txBytes);
  const signatures: string[] = [agentSig];
  if (useSponsor && gasStation) {
    const { signature: gasSig } = await gasStation.signTransaction(txBytes);
    signatures.push(gasSig);
  }

  let response;
  try {
    response = await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature: signatures,
      options: { showEffects: true, showEvents: true },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'submit failed';
    await markActionFailed({ actionId: action.id, errorReason: reason });
    return { status: 'failed', reason, actionId: action.id };
  }

  if (response.effects?.status.status !== 'success') {
    const reason = response.effects?.status.error ?? 'tx aborted on-chain';
    await markActionFailed({
      actionId: action.id,
      errorReason: reason,
      txDigest: response.digest,
    });
    return { status: 'failed', reason, actionId: action.id };
  }

  // 3) Parse WitnessConsumed and persist. Marking the witness consumed BEFORE
  //    confirming the action keeps the table consistent if a later step fails.
  const consumedEvent = extractWitnessConsumed(response, mandate.mandateObjectId);

  await prisma.$transaction([
    prisma.agentWitness.update({
      where: { id: step.id },
      data: {
        consumed: true,
        consumedAt: new Date(),
        consumedTxDigest: response.digest,
      },
    }),
    prisma.agentMandate.update({
      where: { id: mandate.id },
      data: {
        nonce: consumedEvent ? BigInt(consumedEvent.nonce) : mandate.nonce,
        witnessCommit: step.nextCommit,
      },
    }),
  ]);

  await markActionConfirmed({
    actionId: action.id,
    txDigest: response.digest,
    witnessConsumed: consumedEvent,
  });

  return {
    status: 'confirmed',
    txDigest: response.digest,
    actionId: action.id,
    witnessId: step.id,
    nonceAfter: consumedEvent ? BigInt(consumedEvent.nonce) : 0n,
  };
}

async function readOnChainWitnessCommit(mandateObjectId: string): Promise<string> {
  const obj = await getAgentSuiClient().getObject({
    id: mandateObjectId,
    options: { showContent: true },
  });
  const content = obj.data?.content;
  if (!content || content.dataType !== 'moveObject') {
    throw new Error(`mandate ${mandateObjectId} not found or wrong type`);
  }
  const fields = (content.fields as { witness_commit?: number[] | string }) ?? {};
  const commit = fields.witness_commit;
  if (Array.isArray(commit)) {
    const hex = commit.map((b) => b.toString(16).padStart(2, '0')).join('');
    return `0x${hex}`;
  }
  if (typeof commit === 'string') {
    return commit.startsWith('0x') ? commit : `0x${commit}`;
  }
  throw new Error(`mandate ${mandateObjectId} witness_commit missing or unsupported encoding`);
}

// Read agent address lazily inside this module to avoid pulling kms.ts before
// `LEVO_AGENT_SIGNER_SECRET_KEY` is configured (the route layer enforces this).
async function agentAddressForTx(): Promise<string> {
  const { getAgentAddress } = await import('./kms');
  return getAgentAddress();
}

// Re-export bytesToHex so tests and routes can format the on-chain commit consistently.
export { bytesToHex };
