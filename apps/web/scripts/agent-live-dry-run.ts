import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  runAgentLiveDryRunManifest,
  type AgentLiveDryRunManifest,
} from '../lib/agent/executor-dry-run';
import { prisma } from '../lib/prisma';

const ManifestSchema = z.object({
  baseUrl: z.string().url().optional(),
  createdAfter: z.string().datetime().optional(),
  cases: z
    .array(
      z.object({
        id: z.string().min(1),
        mandateId: z.string().min(1),
        expect: z.enum(['executable', 'blocked_paused', 'blocked_revoked']),
      }),
    )
    .min(1),
});

interface CliArgs {
  manifestPath: string;
  json: boolean;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const manifest = await loadManifest(args.manifestPath);
  const report = await runAgentLiveDryRunManifest(manifest);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

async function loadManifest(path: string): Promise<AgentLiveDryRunManifest> {
  const raw = await readFile(path, 'utf8');
  return ManifestSchema.parse(JSON.parse(raw));
}

function parseArgs(argv: string[]): CliArgs {
  let manifestPath = '';
  let json = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      continue;
    }
    if (arg === '--manifest') {
      manifestPath = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printUsageAndExit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!manifestPath) {
    printUsageAndExit(1);
  }

  return { manifestPath, json };
}

function printHumanReport(report: Awaited<ReturnType<typeof runAgentLiveDryRunManifest>>): void {
  console.log('== Levo Agent Live Dry-Run ==');
  console.log(`baseUrl: ${report.baseUrl ?? '(not set)'}`);
  console.log(`createdAfter: ${report.createdAfter ?? '(not set)'}`);
  console.log(`summary: ${report.summary.passed}/${report.summary.total} passed`);
  for (const item of report.cases) {
    const mark = item.ok ? 'PASS' : 'FAIL';
    console.log(
      `${mark} ${item.id} mandate=${item.mandateId} expect=${item.expect} status=${item.status} phase=${item.phase}`,
    );
    if (item.reason) {
      console.log(`  reason: ${item.reason}`);
    }
    if (item.evidence.devInspectStatus) {
      console.log(`  devInspect: ${item.evidence.devInspectStatus}`);
    }
    if (item.evidence.mandateObjectId) {
      console.log(`  object: ${item.evidence.mandateObjectId}`);
    }
  }
}

function printUsageAndExit(code: number): never {
  console.log(
    'Usage: pnpm agent:live-dry-run -- --manifest <manifest.json> [--json]',
  );
  process.exit(code);
}

main()
  .catch((err) => {
    console.error('agent-live-dry-run failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
