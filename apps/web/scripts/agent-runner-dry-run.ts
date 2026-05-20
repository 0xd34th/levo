import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64, normalizeSuiAddress, toBase64 } from '@mysten/sui/utils';
import { z } from 'zod';
import { getGasStationKeypair } from '../lib/gas-station';
import { decryptWitnessForAction } from '../lib/agent/seal-client';
import { getAgentAddress } from '../lib/agent/kms';
import { getAgentSuiClient } from '../lib/agent/sui-client';
import { buildConsumeAndAuthorizeTx, buildSealApproveTx } from '../lib/agent/tx';
import { hexToBytes } from '../lib/agent/witness';
import { signTransactionAsAgent } from '../lib/agent/kms';

const RunnerJobSchema = z.object({
  id: z.string().min(1),
  mandateId: z.string().min(1),
  mandateObjectId: z.string().min(1),
  agentAddress: z.string().min(1),
  trigger: z.string().min(1),
  packageId: z.string().min(1),
  witness: z.object({
    id: z.string().min(1),
    actionType: z.number().int(),
    coinType: z.string().min(1),
    amount: z.string().min(1),
    target: z.string().min(1),
    currentCommit: z.string().min(1),
    nextCommit: z.string().min(1),
    approvalIdentity: z.string().min(1),
    encryptedObjectBase64: z.string().min(1),
  }),
});

const ClaimResponseSchema = z.object({
  jobs: z.array(RunnerJobSchema),
});

interface CliArgs {
  baseUrl: string;
  runnerTokenFile: string;
  agentAlias: string;
  agentAddress?: string;
  outDir: string;
  pollIntervalMs: number;
  timeoutMs: number;
  claimLimit: number;
}

interface HttpEvidence {
  at: string;
  endpoint: string;
  status: number;
  ok: boolean;
}

interface RunnerReport {
  generatedAt: string;
  baseUrl: string;
  outDir: string;
  agentAlias: string;
  expectedAgentAddress: string;
  localSignerAddress: string;
  statuses: HttpEvidence[];
  claimedJob?: z.infer<typeof RunnerJobSchema>;
  dryRunReport?: RunnerDryRunReport;
  error?: string;
}

interface ChainState {
  agent?: string;
  nonce?: string;
  witnessCommit: string;
}

interface RunnerDryRunReport {
  ok: boolean;
  jobId: string;
  mandateId: string;
  mandateObjectId: string;
  resultSubmitted: false;
  phase:
    | 'payload'
    | 'chain_before'
    | 'commit_check'
    | 'seal_decrypt'
    | 'signer_check'
    | 'dev_inspect'
    | 'chain_after'
    | 'runner_get';
  reason?: string;
  evidence: {
    payloadHasEncryptedWitness: boolean;
    approvalIdentity: string;
    currentCommit: string;
    nextCommit: string;
    actionType: number;
    coinType: string;
    amount: string;
    target: string;
    localAgentAddress: string;
    onChainBefore?: ChainState;
    onChainAfter?: ChainState;
    sealDecryptedBytes?: number;
    agentSignatureChecked?: boolean;
    gasSponsorChecked?: boolean;
    sealApprove?: {
      devInspectStatus: string;
      error?: string;
    };
    consumeAuthorize?: {
      devInspectStatus: string;
      error?: string;
    };
    devInspectStatus?: string;
    devInspectError?: string;
    runnerGetStatus?: number;
    runnerGetStillClaimed?: boolean;
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.outDir, { recursive: true });

  const expectedAgentAddress = normalizeSuiAddress(
    args.agentAddress ?? loadSuiAliasAddress(args.agentAlias),
  );
  process.env.LEVO_AGENT_SIGNER_SECRET_KEY = loadSuiAliasSeedBase64(args.agentAlias);
  const localSignerAddress = normalizeSuiAddress(getAgentAddress());
  if (localSignerAddress !== expectedAgentAddress) {
    throw new Error(
      `local signer ${localSignerAddress} does not match expected agent ${expectedAgentAddress}`,
    );
  }

  const runnerToken = (await readFile(args.runnerTokenFile, 'utf8')).trim();
  if (!runnerToken) {
    throw new Error(`runner token file is empty: ${args.runnerTokenFile}`);
  }

  const report: RunnerReport = {
    generatedAt: new Date().toISOString(),
    baseUrl: args.baseUrl,
    outDir: args.outDir,
    agentAlias: args.agentAlias,
    expectedAgentAddress,
    localSignerAddress,
    statuses: [],
  };

  await writeJson(join(args.outDir, 'runner-start.json'), {
    generatedAt: report.generatedAt,
    baseUrl: args.baseUrl,
    agentAlias: args.agentAlias,
    expectedAgentAddress,
    localSignerAddress,
    tokenFile: args.runnerTokenFile,
    pollIntervalMs: args.pollIntervalMs,
    timeoutMs: args.timeoutMs,
  });

  try {
    await runAuthProbes(args.baseUrl, report);
    const job = await pollForJob(args, runnerToken, expectedAgentAddress, report);
    report.claimedJob = job;
    await writeJson(join(args.outDir, 'claimed-job.json'), redactEncryptedPayload(job));

    const dryRunReport = await dryRunClaimedJob(job, runnerToken, args.baseUrl);
    report.dryRunReport = dryRunReport;
    await writeJson(join(args.outDir, 'dry-run-report.json'), dryRunReport);
    if (!dryRunReport.ok) {
      throw new Error(`dry-run failed at ${dryRunReport.phase}: ${dryRunReport.reason}`);
    }
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
    process.exitCode = 1;
  } finally {
    await writeJson(join(args.outDir, 'runner-report.json'), report);
    printSummary(report);
  }
}

async function runAuthProbes(baseUrl: string, report: RunnerReport): Promise<void> {
  const endpoints = [
    '/api/v1/agent/runner/heartbeat',
    '/api/v1/agent/runner/jobs/claim',
  ];
  for (const endpoint of endpoints) {
    const noToken = await postJson(baseUrl, endpoint, {});
    report.statuses.push({
      at: new Date().toISOString(),
      endpoint: `${endpoint} (no token)`,
      status: noToken.status,
      ok: noToken.status === 401,
    });
    const badToken = await postJson(baseUrl, endpoint, {}, 'Bearer lvo_runner_invalid');
    report.statuses.push({
      at: new Date().toISOString(),
      endpoint: `${endpoint} (bad token)`,
      status: badToken.status,
      ok: badToken.status === 401,
    });
  }
}

async function dryRunClaimedJob(
  job: z.infer<typeof RunnerJobSchema>,
  runnerToken: string,
  baseUrl: string,
): Promise<RunnerDryRunReport> {
  const report: RunnerDryRunReport = {
    ok: false,
    jobId: job.id,
    mandateId: job.mandateId,
    mandateObjectId: job.mandateObjectId,
    resultSubmitted: false,
    phase: 'payload',
    evidence: {
      payloadHasEncryptedWitness: Boolean(job.witness.encryptedObjectBase64),
      approvalIdentity: job.witness.approvalIdentity,
      currentCommit: normalizeHex(job.witness.currentCommit),
      nextCommit: normalizeHex(job.witness.nextCommit),
      actionType: job.witness.actionType,
      coinType: job.witness.coinType,
      amount: job.witness.amount,
      target: job.witness.target,
      localAgentAddress: normalizeSuiAddress(getAgentAddress()),
    },
  };

  try {
    report.phase = 'chain_before';
    const before = await readMandateChainState(job.mandateObjectId);
    report.evidence.onChainBefore = before;
    const expectedAgent = normalizeSuiAddress(job.agentAddress);
    if (before.agent && normalizeSuiAddress(before.agent) !== expectedAgent) {
      return failDryRun(
        report,
        'chain_before',
        `on-chain mandate.agent ${before.agent} does not match job agent ${job.agentAddress}`,
      );
    }
    if (expectedAgent !== report.evidence.localAgentAddress) {
      return failDryRun(
        report,
        'signer_check',
        `local agent ${report.evidence.localAgentAddress} does not match job agent ${job.agentAddress}`,
      );
    }

    report.phase = 'commit_check';
    if (before.witnessCommit !== normalizeHex(job.witness.currentCommit)) {
      return failDryRun(
        report,
        'commit_check',
        `on-chain witness_commit drift: have ${before.witnessCommit}, expected ${normalizeHex(job.witness.currentCommit)}`,
      );
    }

    report.phase = 'seal_decrypt';
    const witness = await decryptWitnessForAction({
      mandateId: job.mandateObjectId,
      coinType: job.witness.coinType,
      actionType: job.witness.actionType,
      target: job.witness.target,
      amount: BigInt(job.witness.amount),
      approvalIdentity: hexToBytes(job.witness.approvalIdentity),
      nextCommit: hexToBytes(job.witness.nextCommit),
      encryptedObject: Uint8Array.from(Buffer.from(job.witness.encryptedObjectBase64, 'base64')),
    });
    report.evidence.sealDecryptedBytes = witness.length;

    report.phase = 'signer_check';
    report.evidence.gasSponsorChecked = await checkAgentSigner({
      mandateObjectId: job.mandateObjectId,
      actionType: job.witness.actionType,
      coinType: job.witness.coinType,
      amount: job.witness.amount,
      target: job.witness.target,
      nextCommit: job.witness.nextCommit,
      witness,
      agentAddress: expectedAgent,
    });
    report.evidence.agentSignatureChecked = true;

    report.phase = 'dev_inspect';
    const sealApprove = await devInspectSealApprove({
      mandateObjectId: job.mandateObjectId,
      actionType: job.witness.actionType,
      coinType: job.witness.coinType,
      amount: job.witness.amount,
      target: job.witness.target,
      approvalIdentity: job.witness.approvalIdentity,
      nextCommit: job.witness.nextCommit,
      agentAddress: expectedAgent,
    });
    report.evidence.sealApprove = {
      devInspectStatus: sealApprove.status,
      error: sealApprove.error,
    };
    if (sealApprove.status !== 'success') {
      report.evidence.devInspectStatus = sealApprove.status;
      report.evidence.devInspectError = sealApprove.error;
      return failDryRun(report, 'dev_inspect', sealApprove.error ?? 'seal_approve devInspect failed');
    }

    const consumeAuthorize = await devInspectConsumeAndAuthorize({
      mandateObjectId: job.mandateObjectId,
      actionType: job.witness.actionType,
      coinType: job.witness.coinType,
      amount: job.witness.amount,
      target: job.witness.target,
      nextCommit: job.witness.nextCommit,
      witness,
      agentAddress: expectedAgent,
    });
    report.evidence.consumeAuthorize = {
      devInspectStatus: consumeAuthorize.status,
      error: consumeAuthorize.error,
    };
    report.evidence.devInspectStatus = consumeAuthorize.status;
    report.evidence.devInspectError = consumeAuthorize.error;
    if (consumeAuthorize.status !== 'success') {
      return failDryRun(report, 'dev_inspect', consumeAuthorize.error ?? 'consume/authorize devInspect failed');
    }

    report.phase = 'chain_after';
    const after = await readMandateChainState(job.mandateObjectId);
    report.evidence.onChainAfter = after;
    if (after.nonce !== before.nonce) {
      return failDryRun(report, 'chain_after', `mandate nonce changed: ${before.nonce} -> ${after.nonce}`);
    }
    if (after.witnessCommit !== before.witnessCommit) {
      return failDryRun(
        report,
        'chain_after',
        `mandate witness_commit changed: ${before.witnessCommit} -> ${after.witnessCommit}`,
      );
    }

    report.phase = 'runner_get';
    const getJob = await getJson(baseUrl, `/api/v1/agent/runner/jobs/${job.id}`, `Bearer ${runnerToken}`);
    report.evidence.runnerGetStatus = getJob.status;
    report.evidence.runnerGetStillClaimed = getJob.status === 200;
    if (getJob.status !== 200) {
      return failDryRun(report, 'runner_get', `claimed job was not readable after dry-run: HTTP ${getJob.status}`);
    }

    report.ok = true;
    return report;
  } catch (err) {
    return failDryRun(report, report.phase, err instanceof Error ? err.message : String(err));
  }
}

async function checkAgentSigner(args: {
  mandateObjectId: string;
  actionType: number;
  coinType: string;
  amount: string;
  target: string;
  nextCommit: string;
  witness: Uint8Array;
  agentAddress: string;
}): Promise<boolean> {
  const client = getAgentSuiClient();
  const tx = buildConsumeAndAuthorizeTx({
    mandateId: args.mandateObjectId,
    coinType: args.coinType,
    action: args.actionType,
    target: args.target,
    amount: BigInt(args.amount),
    witness: args.witness,
    nextCommit: hexToBytes(args.nextCommit),
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

async function devInspectSealApprove(args: {
  mandateObjectId: string;
  actionType: number;
  coinType: string;
  amount: string;
  target: string;
  approvalIdentity: string;
  nextCommit: string;
  agentAddress: string;
}): Promise<{ status: string; error?: string }> {
  const tx = buildSealApproveTx({
    identity: hexToBytes(args.approvalIdentity),
    mandateId: args.mandateObjectId,
    coinType: args.coinType,
    actionType: args.actionType,
    target: args.target,
    amount: BigInt(args.amount),
    nextCommit: hexToBytes(args.nextCommit),
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

async function devInspectConsumeAndAuthorize(args: {
  mandateObjectId: string;
  actionType: number;
  coinType: string;
  amount: string;
  target: string;
  nextCommit: string;
  witness: Uint8Array;
  agentAddress: string;
}): Promise<{ status: string; error?: string }> {
  const tx = buildConsumeAndAuthorizeTx({
    mandateId: args.mandateObjectId,
    coinType: args.coinType,
    action: args.actionType,
    target: args.target,
    amount: BigInt(args.amount),
    witness: args.witness,
    nextCommit: hexToBytes(args.nextCommit),
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

async function readMandateChainState(mandateObjectId: string): Promise<ChainState> {
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
    agent: typeof fields.agent === 'string' ? fields.agent : undefined,
    nonce: typeof fields.nonce === 'string' ? fields.nonce : undefined,
    witnessCommit: readCommitField(fields.witness_commit),
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

function failDryRun(
  report: RunnerDryRunReport,
  phase: RunnerDryRunReport['phase'],
  reason: string,
): RunnerDryRunReport {
  report.ok = false;
  report.phase = phase;
  report.reason = reason;
  return report;
}

async function pollForJob(
  args: CliArgs,
  runnerToken: string,
  expectedAgentAddress: string,
  report: RunnerReport,
): Promise<z.infer<typeof RunnerJobSchema>> {
  const deadline = Date.now() + args.timeoutMs;
  while (Date.now() <= deadline) {
    const heartbeat = await postJson(
      args.baseUrl,
      '/api/v1/agent/runner/heartbeat',
      {},
      `Bearer ${runnerToken}`,
    );
    report.statuses.push({
      at: new Date().toISOString(),
      endpoint: '/api/v1/agent/runner/heartbeat',
      status: heartbeat.status,
      ok: heartbeat.status === 200,
    });

    const claim = await postJson(
      args.baseUrl,
      '/api/v1/agent/runner/jobs/claim',
      { limit: args.claimLimit },
      `Bearer ${runnerToken}`,
    );
    report.statuses.push({
      at: new Date().toISOString(),
      endpoint: '/api/v1/agent/runner/jobs/claim',
      status: claim.status,
      ok: claim.status === 200,
    });
    if (claim.status !== 200) {
      throw new Error(`claim failed with HTTP ${claim.status}`);
    }

    const parsed = ClaimResponseSchema.parse(claim.body);
    const job = parsed.jobs.find(
      (candidate) => normalizeSuiAddress(candidate.agentAddress) === expectedAgentAddress,
    );
    if (job) {
      return job;
    }
    if (parsed.jobs.length > 0) {
      throw new Error(
        `claimed job agent did not match local agent ${expectedAgentAddress}`,
      );
    }
    await sleep(args.pollIntervalMs);
  }
  throw new Error(`timed out after ${args.timeoutMs}ms waiting for runner job`);
}

async function postJson(
  baseUrl: string,
  endpoint: string,
  body: unknown,
  authorization?: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authorization) headers.authorization = authorization;
  const res = await fetch(new URL(endpoint, baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function getJson(
  baseUrl: string,
  endpoint: string,
  authorization?: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (authorization) headers.authorization = authorization;
  const res = await fetch(new URL(endpoint, baseUrl), { headers });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

function parseArgs(argv: string[]): CliArgs {
  const startedAt = new Date().toISOString().replace(/[:.]/g, '-');
  const args: CliArgs = {
    baseUrl: 'https://levo.krilly.ai',
    runnerTokenFile: '',
    agentAlias: 'agent-alpha',
    outDir: `/tmp/levo-agent-flow-${startedAt}`,
    pollIntervalMs: 10_000,
    timeoutMs: 90_000,
    claimLimit: 5,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      continue;
    }
    const next = () => {
      const value = argv[i + 1];
      if (!value) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };
    if (arg === '--base-url') args.baseUrl = next();
    else if (arg === '--runner-token-file') args.runnerTokenFile = next();
    else if (arg === '--agent-alias') args.agentAlias = next();
    else if (arg === '--agent-address') args.agentAddress = next();
    else if (arg === '--out-dir') args.outDir = next();
    else if (arg === '--poll-interval-ms') args.pollIntervalMs = Number(next());
    else if (arg === '--timeout-ms') args.timeoutMs = Number(next());
    else if (arg === '--claim-limit') args.claimLimit = Number(next());
    else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.runnerTokenFile) {
    printUsageAndExit(1);
  }
  if (!Number.isFinite(args.pollIntervalMs) || args.pollIntervalMs < 1000) {
    throw new Error('--poll-interval-ms must be at least 1000');
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < args.pollIntervalMs) {
    throw new Error('--timeout-ms must be >= --poll-interval-ms');
  }
  if (!Number.isInteger(args.claimLimit) || args.claimLimit < 1 || args.claimLimit > 25) {
    throw new Error('--claim-limit must be an integer between 1 and 25');
  }
  return args;
}

function loadSuiAliasAddress(alias: string): string {
  const { keypair } = loadSuiAliasSecret(alias);
  return keypair.getPublicKey().toSuiAddress();
}

function loadSuiAliasSeedBase64(alias: string): string {
  return Buffer.from(loadSuiAliasSecret(alias).seed).toString('base64');
}

function loadSuiAliasSecret(alias: string): { keypair: Ed25519Keypair; seed: Uint8Array } {
  const aliases = readSuiAliases();
  const entry = aliases.find((item) => item.alias === alias);
  if (!entry) throw new Error(`Sui alias not found: ${alias}`);
  const keystore = JSON.parse(
    readFileSync(join(homedir(), '.sui/sui_config/sui.keystore'), 'utf8'),
  ) as string[];
  for (const encoded of keystore) {
    const bytes = fromBase64(encoded);
    if (bytes[0] !== 0 || bytes.length !== 33) continue;
    const seed = bytes.slice(1);
    const keypair = Ed25519Keypair.fromSecretKey(seed);
    if (toBase64(keypair.getPublicKey().toSuiBytes()) === entry.public_key_base64) {
      return { keypair, seed };
    }
  }
  throw new Error(`Private key for Sui alias ${alias} was not found in keystore`);
}

function readSuiAliases(): Array<{ alias: string; public_key_base64: string }> {
  return JSON.parse(
    readFileSync(join(homedir(), '.sui/sui_config/sui.aliases'), 'utf8'),
  ) as Array<{ alias: string; public_key_base64: string }>;
}

function redactEncryptedPayload(job: z.infer<typeof RunnerJobSchema>): unknown {
  return {
    ...job,
    witness: {
      ...job.witness,
      encryptedObjectBase64: `<redacted:${job.witness.encryptedObjectBase64.length}>`,
    },
  };
}

function normalizeHex(value: string): string {
  return value.startsWith('0x') ? value.toLowerCase() : `0x${value.toLowerCase()}`;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function printSummary(report: RunnerReport): void {
  const lastHeartbeat = [...report.statuses].reverse().find((s) =>
    s.endpoint.includes('heartbeat'),
  );
  const lastClaim = [...report.statuses].reverse().find((s) => s.endpoint.includes('claim'));
  console.log(
    JSON.stringify(
      {
        ok: !report.error && report.dryRunReport?.ok === true,
        outDir: report.outDir,
        expectedAgentAddress: report.expectedAgentAddress,
        localSignerAddress: report.localSignerAddress,
        heartbeatStatus: lastHeartbeat?.status,
        claimStatus: lastClaim?.status,
        jobId: report.claimedJob?.id,
        mandateId: report.claimedJob?.mandateId,
        dryRunOk: report.dryRunReport?.ok,
        dryRunPhase: report.dryRunReport?.phase,
        error: report.error,
      },
      null,
      2,
    ),
  );
}

function printUsageAndExit(code: number): never {
  console.log(
    [
      'Usage:',
      '  pnpm agent:runner-dry-run -- --runner-token-file /tmp/levo-agent-flow-.../runner-token [options]',
      '',
      'Options:',
      '  --base-url https://levo.krilly.ai',
      '  --agent-alias agent-alpha',
      '  --agent-address 0x...',
      '  --out-dir /tmp/levo-agent-flow-...',
      '  --poll-interval-ms 10000',
      '  --timeout-ms 90000',
      '  --claim-limit 5',
    ].join('\n'),
  );
  process.exit(code);
}

main()
  .catch((err) => {
    console.error('agent-runner-dry-run failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
