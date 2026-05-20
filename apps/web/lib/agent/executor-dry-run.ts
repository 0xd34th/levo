import type { AgentMandate, AgentWitness } from '@/lib/generated/prisma/client';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { getGasStationKeypair } from '@/lib/gas-station';
import { prisma } from '@/lib/prisma';
import { getMandateExecutionBlockReason } from './execution-guard';
import { getAgentAddress, signTransactionAsAgent } from './kms';
import { decryptWitnessForAction } from './seal-client';
import { getAgentSuiClient } from './sui-client';
import { buildConsumeAndAuthorizeTx } from './tx';
import { hexToBytes } from './witness';

export type AgentLiveDryRunExpectation =
  | 'executable'
  | 'blocked_paused'
  | 'blocked_revoked';

export interface AgentLiveDryRunCase {
  id: string;
  mandateId: string;
  expect: AgentLiveDryRunExpectation;
}

export interface AgentLiveDryRunManifest {
  baseUrl?: string;
  createdAfter?: string;
  cases: AgentLiveDryRunCase[];
}

export interface AgentLiveDryRunReport {
  baseUrl: string | null;
  createdAfter: string | null;
  generatedAt: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  cases: AgentLiveDryRunCaseReport[];
}

export interface AgentLiveDryRunCaseReport {
  id: string;
  mandateId: string;
  expect: AgentLiveDryRunExpectation;
  ok: boolean;
  status: 'executable' | 'blocked' | 'failed' | 'no_steps_pending';
  phase:
    | 'load'
    | 'created_after'
    | 'guard'
    | 'witness'
    | 'commit_check'
    | 'seal_decrypt'
    | 'signer_check'
    | 'dev_inspect'
    | 'db_invariant';
  reason?: string;
  evidence: {
    mandateObjectId?: string;
    mandateStatus?: AgentMandate['status'];
    mandateName?: string;
    createdAt?: string;
    witnessId?: string;
    witnessChainIndex?: number;
    actionType?: number;
    coinType?: string;
    amount?: string;
    target?: string;
    onChainWitnessCommit?: string;
    dbWitnessCommit?: string | null;
    nextCommit?: string;
    agentAddress?: string;
    onChainAgent?: string;
    sealDecryptedBytes?: number;
    agentSignatureChecked?: boolean;
    gasSponsorChecked?: boolean;
    devInspectStatus?: string;
    devInspectError?: string;
    dbBefore?: DryRunDbSnapshot;
    dbAfter?: DryRunDbSnapshot;
  };
}

interface MandateWithWitness extends AgentMandate {
  agentWitnesses: AgentWitness[];
}

interface DryRunDbSnapshot {
  actionCount: number;
  consumedWitnessIds: string[];
  nonce: string;
  witnessCommit: string | null;
  status: AgentMandate['status'];
}

export async function runAgentLiveDryRunManifest(
  manifest: AgentLiveDryRunManifest,
): Promise<AgentLiveDryRunReport> {
  const cases: AgentLiveDryRunCaseReport[] = [];
  for (const testCase of manifest.cases) {
    cases.push(
      await dryRunAgentMandate({
        testCase,
        createdAfter: parseCreatedAfter(manifest.createdAfter),
      }),
    );
  }

  const passed = cases.filter((c) => c.ok).length;
  return {
    baseUrl: manifest.baseUrl ?? null,
    createdAfter: manifest.createdAfter ?? null,
    generatedAt: new Date().toISOString(),
    summary: {
      total: cases.length,
      passed,
      failed: cases.length - passed,
    },
    cases,
  };
}

export async function dryRunAgentMandate(args: {
  testCase: AgentLiveDryRunCase;
  createdAfter?: Date | null;
}): Promise<AgentLiveDryRunCaseReport> {
  const { testCase } = args;
  const report = baseReport(testCase);

  try {
    const mandate = await prisma.agentMandate.findUnique({
      where: { id: testCase.mandateId },
      include: {
        agentWitnesses: {
          where: { consumed: false },
          orderBy: { chainIndex: 'asc' },
          take: 1,
        },
      },
    });

    if (!mandate) {
      return fail(report, 'load', 'mandate not found');
    }

    const typedMandate = mandate as MandateWithWitness;
    report.evidence.mandateObjectId = typedMandate.mandateObjectId;
    report.evidence.mandateStatus = typedMandate.status;
    report.evidence.mandateName = typedMandate.name;
    report.evidence.createdAt = typedMandate.createdAt.toISOString();
    report.evidence.dbBefore = await snapshotDb(typedMandate.id);

    if (args.createdAfter && typedMandate.createdAt < args.createdAfter) {
      return fail(
        report,
        'created_after',
        `mandate createdAt ${typedMandate.createdAt.toISOString()} is before manifest createdAfter ${args.createdAfter.toISOString()}`,
      );
    }

    const blockedReason = getMandateExecutionBlockReason(typedMandate, Date.now());
    if (blockedReason) {
      report.status = 'blocked';
      report.phase = 'guard';
      report.reason = blockedReason;
      return finalizeWithDbInvariant(
        report,
        typedMandate.id,
        isExpectedBlock(testCase.expect, blockedReason),
      );
    }

    const step = typedMandate.agentWitnesses[0];
    if (!step) {
      report.status = 'no_steps_pending';
      report.phase = 'witness';
      report.reason = 'no unconsumed witness step';
      return finalizeWithDbInvariant(report, typedMandate.id, testCase.expect === 'executable');
    }

    report.evidence.witnessId = step.id;
    report.evidence.witnessChainIndex = step.chainIndex;
    report.evidence.actionType = step.actionType;
    report.evidence.coinType = step.coinType;
    report.evidence.amount = step.amount;
    report.evidence.target = step.target;
    report.evidence.dbWitnessCommit = typedMandate.witnessCommit;
    report.evidence.nextCommit = normalizeHex(step.nextCommit);

    const onChain = await readMandateChainState(typedMandate.mandateObjectId);
    report.evidence.onChainWitnessCommit = onChain.witnessCommit;
    report.evidence.onChainAgent = onChain.agent;
    if (onChain.witnessCommit !== normalizeHex(step.currentCommit)) {
      return fail(
        report,
        'commit_check',
        `on-chain witness_commit drift: have ${onChain.witnessCommit}, expected ${normalizeHex(step.currentCommit)}`,
      );
    }

    const witness = await decryptWitnessForAction({
      mandateId: typedMandate.mandateObjectId,
      coinType: step.coinType,
      actionType: step.actionType,
      target: step.target,
      amount: BigInt(step.amount),
      approvalIdentity: hexToBytes(step.approvalIdentity),
      nextCommit: hexToBytes(step.nextCommit),
      encryptedObject: Uint8Array.from(step.encryptedObject),
    });
    report.evidence.sealDecryptedBytes = witness.length;

    const agentAddress = getAgentAddress();
    report.evidence.agentAddress = agentAddress;
    if (onChain.agent && normalizeAddress(onChain.agent) !== normalizeAddress(agentAddress)) {
      return fail(
        report,
        'signer_check',
        `agent signer ${agentAddress} does not match on-chain mandate.agent ${onChain.agent}`,
      );
    }

    report.evidence.gasSponsorChecked = await checkAgentSigner({
      mandateObjectId: typedMandate.mandateObjectId,
      step,
      witness,
      agentAddress,
    });
    report.evidence.agentSignatureChecked = true;

    const devInspect = await devInspectConsumeAndAuthorize({
      mandateObjectId: typedMandate.mandateObjectId,
      step,
      witness,
      agentAddress,
    });
    report.evidence.devInspectStatus = devInspect.status;
    report.evidence.devInspectError = devInspect.error;
    if (devInspect.status !== 'success') {
      return fail(
        report,
        'dev_inspect',
        devInspect.error ?? 'consume_witness devInspect failed',
      );
    }

    report.status = 'executable';
    report.phase = 'dev_inspect';
    return finalizeWithDbInvariant(report, typedMandate.id, testCase.expect === 'executable');
  } catch (err) {
    return fail(report, report.phase, err instanceof Error ? err.message : String(err));
  }
}

async function checkAgentSigner(args: {
  mandateObjectId: string;
  step: AgentWitness;
  witness: Uint8Array;
  agentAddress: string;
}): Promise<boolean> {
  const client = getAgentSuiClient();
  const tx = buildConsumeAndAuthorizeTx({
    mandateId: args.mandateObjectId,
    coinType: args.step.coinType,
    action: args.step.actionType,
    target: args.step.target,
    amount: BigInt(args.step.amount),
    witness: args.witness,
    nextCommit: hexToBytes(args.step.nextCommit),
  });
  tx.setSender(args.agentAddress);

  const gasStation = getGasStationKeypair();
  const useSponsor = gasStation !== null && gasStation.toSuiAddress() !== args.agentAddress;
  if (useSponsor && gasStation) {
    tx.setGasOwner(gasStation.toSuiAddress());
  }

  const txBytes = await tx.build({ client });
  await signTransactionAsAgent(txBytes);
  if (useSponsor && gasStation) {
    await gasStation.signTransaction(txBytes);
  }
  return useSponsor;
}

async function devInspectConsumeAndAuthorize(args: {
  mandateObjectId: string;
  step: AgentWitness;
  witness: Uint8Array;
  agentAddress: string;
}): Promise<{ status: string; error?: string }> {
  const tx = buildConsumeAndAuthorizeTx({
    mandateId: args.mandateObjectId,
    coinType: args.step.coinType,
    action: args.step.actionType,
    target: args.step.target,
    amount: BigInt(args.step.amount),
    witness: args.witness,
    nextCommit: hexToBytes(args.step.nextCommit),
  });

  const result = await getAgentSuiClient().devInspectTransactionBlock({
    sender: args.agentAddress,
    transactionBlock: tx,
  });

  return {
    status: result.effects?.status.status ?? 'unknown',
    error: result.effects?.status.error,
  };
}

async function readMandateChainState(mandateObjectId: string): Promise<{
  witnessCommit: string;
  agent?: string;
}> {
  const obj = await getAgentSuiClient().getObject({
    id: mandateObjectId,
    options: { showContent: true },
  });
  const content = obj.data?.content;
  if (!content || content.dataType !== 'moveObject') {
    throw new Error(`mandate ${mandateObjectId} not found or wrong type`);
  }
  const fields = (content.fields as Record<string, unknown>) ?? {};
  return {
    witnessCommit: readCommitField(fields.witness_commit),
    agent: typeof fields.agent === 'string' ? fields.agent : undefined,
  };
}

function readCommitField(value: unknown): string {
  if (Array.isArray(value)) {
    const hex = value.map((b) => Number(b).toString(16).padStart(2, '0')).join('');
    return `0x${hex}`;
  }
  if (typeof value === 'string') {
    return normalizeHex(value);
  }
  throw new Error('mandate witness_commit missing or unsupported encoding');
}

async function snapshotDb(mandateId: string): Promise<DryRunDbSnapshot> {
  const [mandate, actionCount, consumedWitnesses] = await Promise.all([
    prisma.agentMandate.findUnique({
      where: { id: mandateId },
      select: { nonce: true, witnessCommit: true, status: true },
    }),
    prisma.agentAction.count({ where: { mandateId } }),
    prisma.agentWitness.findMany({
      where: { mandateId, consumed: true },
      orderBy: { chainIndex: 'asc' },
      select: { id: true },
    }),
  ]);
  if (!mandate) {
    throw new Error('mandate disappeared during dry-run');
  }
  return {
    actionCount,
    consumedWitnessIds: consumedWitnesses.map((w) => w.id),
    nonce: mandate.nonce.toString(),
    witnessCommit: mandate.witnessCommit,
    status: mandate.status,
  };
}

function assertNoDbMutation(
  before: DryRunDbSnapshot | undefined,
  after: DryRunDbSnapshot | undefined,
): string | null {
  if (!before || !after) {
    return 'missing DB mutation snapshot';
  }
  if (before.actionCount !== after.actionCount) {
    return `AgentAction count changed: before ${before.actionCount}, after ${after.actionCount}`;
  }
  if (before.consumedWitnessIds.join(',') !== after.consumedWitnessIds.join(',')) {
    return 'consumed witness set changed';
  }
  if (before.nonce !== after.nonce) {
    return `mandate nonce changed: before ${before.nonce}, after ${after.nonce}`;
  }
  if (before.witnessCommit !== after.witnessCommit) {
    return `mandate witnessCommit changed: before ${before.witnessCommit}, after ${after.witnessCommit}`;
  }
  if (before.status !== after.status) {
    return `mandate status changed: before ${before.status}, after ${after.status}`;
  }
  return null;
}

function isExpectedBlock(expect: AgentLiveDryRunExpectation, reason: string): boolean {
  if (expect === 'blocked_paused') {
    return reason.includes('PAUSED_BY_USER') || reason.toLowerCase().includes('paused');
  }
  if (expect === 'blocked_revoked') {
    return reason.includes('REVOKED') || reason.toLowerCase().includes('revoked');
  }
  return false;
}

function finalizeExpected(
  report: AgentLiveDryRunCaseReport,
  expectationMatched: boolean,
): AgentLiveDryRunCaseReport {
  report.ok = expectationMatched;
  if (!expectationMatched && !report.reason) {
    report.reason = `expected ${report.expect}, got ${report.status}`;
  } else if (!expectationMatched) {
    report.reason = `expected ${report.expect}, got ${report.status}: ${report.reason}`;
  }
  return report;
}

async function finalizeWithDbInvariant(
  report: AgentLiveDryRunCaseReport,
  mandateId: string,
  expectationMatched: boolean,
): Promise<AgentLiveDryRunCaseReport> {
  report.evidence.dbAfter = await snapshotDb(mandateId);
  const invariantError = assertNoDbMutation(report.evidence.dbBefore, report.evidence.dbAfter);
  if (invariantError) {
    return fail(report, 'db_invariant', invariantError);
  }
  return finalizeExpected(report, expectationMatched);
}

function fail(
  report: AgentLiveDryRunCaseReport,
  phase: AgentLiveDryRunCaseReport['phase'],
  reason: string,
): AgentLiveDryRunCaseReport {
  report.ok = false;
  report.status = 'failed';
  report.phase = phase;
  report.reason = reason;
  return report;
}

function baseReport(testCase: AgentLiveDryRunCase): AgentLiveDryRunCaseReport {
  return {
    id: testCase.id,
    mandateId: testCase.mandateId,
    expect: testCase.expect,
    ok: false,
    status: 'failed',
    phase: 'load',
    evidence: {},
  };
}

function parseCreatedAfter(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid manifest createdAfter: ${value}`);
  }
  return date;
}

function normalizeHex(value: string): string {
  return value.startsWith('0x') ? value.toLowerCase() : `0x${value.toLowerCase()}`;
}

function normalizeAddress(value: string): string {
  return normalizeSuiAddress(value).toLowerCase();
}
