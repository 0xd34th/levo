import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertCommandSucceeded,
  ensureActiveMainnet,
  extractJsonFromOutput,
  formatCommand,
  runCommand,
} from '../../../scripts/mainnet-bootstrap-runtime.ts';
import { extractLevoUsdPublishResult } from '../../../scripts/mainnet-bootstrap-lib.ts';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, '..');
const publishTempDir = path.join(packageDir, '.publish-mainnet-temp');

export interface PublishLevoUsdMainnetOptions {
  confirmMainnet: boolean;
  publishArgs?: string[];
  clientConfig?: string;
}

function printUsage() {
  console.log(
    [
      'Usage: pnpm publish:levo-usd:mainnet -- --confirm-mainnet [additional sui client publish args]',
      '',
      'This wrapper:',
      '1. verifies the active Sui CLI environment is mainnet',
      '2. stages a temporary standalone package without Published.toml state',
      '3. publishes only the standalone packages/levo-usd package',
      '4. emits structured json when --json is present',
      '',
      'Example:',
      '  pnpm publish:levo-usd:mainnet -- --confirm-mainnet --gas-budget 50000000 --dry-run',
    ].join('\n'),
  );
}

export function publishLevoUsdMainnet(options: PublishLevoUsdMainnetOptions) {
  if (!options.confirmMainnet) {
    throw new Error('Refusing to publish without --confirm-mainnet.');
  }

  ensureActiveMainnet(options.clientConfig);

  rmSync(publishTempDir, { recursive: true, force: true });
  mkdirSync(publishTempDir, { recursive: true });

  cpSync(path.join(packageDir, 'Move.toml'), path.join(publishTempDir, 'Move.toml'));
  cpSync(path.join(packageDir, 'Move.lock'), path.join(publishTempDir, 'Move.lock'));
  cpSync(path.join(packageDir, 'sources'), path.join(publishTempDir, 'sources'), {
    recursive: true,
  });

  const publishArgs = [...(options.publishArgs ?? [])].filter((arg) => arg !== '--json');
  if (!publishArgs.includes('--force')) {
    publishArgs.push('--force');
  }

  const commandArgs = options.clientConfig
    ? ['client', '--client.config', options.clientConfig, 'publish', ...publishArgs, '--json', publishTempDir]
    : ['client', 'publish', ...publishArgs, '--json', publishTempDir];

  try {
    const result = runCommand('sui', commandArgs, { cwd: packageDir });
    assertCommandSucceeded(result, 'Publishing standalone LevoUSD package', formatCommand('sui', commandArgs));
    return extractLevoUsdPublishResult(extractJsonFromOutput(result.stdout));
  } finally {
    rmSync(publishTempDir, { recursive: true, force: true });
  }
}

function parseCliArgs(argv: string[]) {
  const userArgs = argv.filter((arg) => arg !== '--');
  return {
    wantsHelp: userArgs.includes('--help') || userArgs.includes('-h'),
    wantsJson: userArgs.includes('--json'),
    confirmedMainnet: userArgs.includes('--confirm-mainnet'),
    publishArgs: userArgs.filter((arg) => arg !== '--confirm-mainnet'),
  };
}

function main() {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.wantsHelp) {
    printUsage();
    process.exit(0);
  }

  try {
    const result = publishLevoUsdMainnet({
      confirmMainnet: parsed.confirmedMainnet,
      publishArgs: parsed.publishArgs,
    });

    if (parsed.wantsJson) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(
      [
        'Standalone LevoUSD publish completed.',
        `Package ID: ${result.publishPackageId}`,
        `TreasuryCap: ${result.treasuryCapId}`,
        `Currency: ${result.currencyId}`,
        `Coin type: ${result.coinType}`,
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
