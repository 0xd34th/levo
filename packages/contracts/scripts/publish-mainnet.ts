import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertCommandSucceeded,
  ensureActiveMainnet,
  extractJsonFromOutput,
  formatCommand,
  normalizeHex,
  runCommand,
} from '../../../scripts/mainnet-bootstrap-runtime.ts';
import { extractContractsPublishResult } from '../../../scripts/mainnet-bootstrap-lib.ts';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const contractsDir = path.resolve(scriptDir, '..');
const sourcesDir = path.join(contractsDir, 'sources');
const testUsdcSource = path.join(sourcesDir, 'test_usdc.move');
const publishTempDir = path.join(contractsDir, '.publish-mainnet-temp');

export interface PublishContractsMainnetOptions {
  confirmMainnet: boolean;
  publishArgs?: string[];
  sender?: string;
  clientConfig?: string;
}

export function getContractsMainnetExcludedSources() {
  return ['test_usdc.move'];
}

function printUsage() {
  console.log(
    [
      'Usage: pnpm publish:contracts:mainnet -- --confirm-mainnet [additional sui client publish args]',
      '',
      'This wrapper:',
      '1. verifies the active Sui environment is mainnet',
      '2. stages a temporary package without testnet-only sources',
      '3. runs `sui client publish` against that clean package with --force',
      '4. emits structured json when --json is present',
      '5. deletes the temporary staging directory before exiting',
      '',
      'Example:',
      '  pnpm publish:contracts:mainnet -- --confirm-mainnet --gas-budget 100000000 --sender 0x...',
    ].join('\n'),
  );
}

export function publishContractsMainnet(options: PublishContractsMainnetOptions) {
  if (!options.confirmMainnet) {
    throw new Error('Refusing to publish without --confirm-mainnet.');
  }

  if (!existsSync(testUsdcSource)) {
    throw new Error(`Expected ${testUsdcSource} to exist before publish.`);
  }

  ensureActiveMainnet(options.clientConfig);

  rmSync(publishTempDir, { recursive: true, force: true });
  mkdirSync(publishTempDir, { recursive: true });

  cpSync(path.join(contractsDir, 'Move.toml'), path.join(publishTempDir, 'Move.toml'));
  cpSync(path.join(contractsDir, 'Move.lock'), path.join(publishTempDir, 'Move.lock'));
  cpSync(path.join(contractsDir, 'sources'), path.join(publishTempDir, 'sources'), {
    recursive: true,
  });
  for (const filename of getContractsMainnetExcludedSources()) {
    rmSync(path.join(publishTempDir, 'sources', filename), { force: true });
  }

  const finalPublishArgs = [...(options.publishArgs ?? [])].filter((arg) => arg !== '--json');
  if (!finalPublishArgs.includes('--force')) {
    finalPublishArgs.push('--force');
  }
  if (!finalPublishArgs.includes('--install-dir')) {
    finalPublishArgs.push('--install-dir', publishTempDir);
  }

  const commandArgs = options.clientConfig
    ? ['client', '--client.config', options.clientConfig, 'publish', ...finalPublishArgs, '--json', publishTempDir]
    : ['client', 'publish', ...finalPublishArgs, '--json', publishTempDir];
  if (options.sender) {
    commandArgs.splice(commandArgs.length - 2, 0, '--sender', normalizeHex(options.sender, 'sender address'));
  }

  try {
    const result = runCommand('sui', commandArgs, { cwd: contractsDir });
    assertCommandSucceeded(result, 'Publishing xvault/verifier package', formatCommand('sui', commandArgs));
    return extractContractsPublishResult(extractJsonFromOutput(result.stdout));
  } finally {
    rmSync(publishTempDir, { recursive: true, force: true });
  }
}

function parseCliArgs(argv: string[]) {
  const userArgs = argv.filter((arg) => arg !== '--');
  const wantsHelp = userArgs.includes('--help') || userArgs.includes('-h');
  const confirmedMainnet = userArgs.includes('--confirm-mainnet');
  const wantsJson = userArgs.includes('--json');
  let sender: string | undefined;
  const publishArgs: string[] = [];

  for (let index = 0; index < userArgs.length; index += 1) {
    const arg = userArgs[index];
    if (arg === '--confirm-mainnet') {
      continue;
    }
    if (arg === '--sender') {
      sender = userArgs[++index];
      continue;
    }
    publishArgs.push(arg);
  }

  return {
    wantsHelp,
    wantsJson,
    confirmedMainnet,
    sender,
    publishArgs,
  };
}

function main() {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.wantsHelp) {
    printUsage();
    process.exit(0);
  }

  try {
    const result = publishContractsMainnet({
      confirmMainnet: parsed.confirmedMainnet,
      publishArgs: parsed.publishArgs,
      sender: parsed.sender,
    });

    if (parsed.wantsJson) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(
      [
        'Contracts publish completed.',
        `Package ID: ${result.packageId}`,
        `XVaultRegistry: ${result.xVaultRegistryId}`,
        `EnclaveRegistry: ${result.enclaveRegistryId}`,
        `UpgradeCap: ${result.upgradeCapId}`,
        `Tx digest: ${result.publishTxDigest}`,
      ].join('\n'),
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
