import { ed25519 } from '@noble/curves/ed25519.js';

import {
  ensureActiveMainnet,
  extractJsonFromOutput,
  formatCommand,
  normalizeHex,
  runCommand,
} from '../../../scripts/mainnet-bootstrap-runtime.ts';
import { assertSuiEffectsSuccess } from '../../../scripts/mainnet-bootstrap-lib.ts';

export interface RegisterEnclavePubkeyOptions {
  packageId: string;
  enclaveRegistryId: string;
  pubkeyHex?: string;
  seedBase64?: string;
  gasBudget?: string;
  sender?: string;
  dryRun?: boolean;
  executeMainnet?: boolean;
  confirmMainnet?: boolean;
  clientConfig?: string;
}

function printUsage() {
  console.log(
    [
      'Usage: pnpm register:enclave-pubkey -- --package-id <id> --enclave-registry-id <id> (--pubkey-hex <hex> | --seed-base64 <base64>) [--gas-budget <mist>] [--sender <address>] [--dry-run] [--execute-mainnet --confirm-mainnet] [--json]',
      '',
      'Default mode prints the exact Sui CLI command you can review before running it.',
      'Use --dry-run to execute the command against the active mainnet CLI environment.',
      'Use --execute-mainnet together with --confirm-mainnet for the real transaction.',
      '',
      'Examples:',
      '  pnpm register:enclave-pubkey -- --package-id 0x... --enclave-registry-id 0x... --seed-base64 <BASE64>',
      '  pnpm register:enclave-pubkey -- --package-id 0x... --enclave-registry-id 0x... --pubkey-hex 0x... --dry-run',
    ].join('\n'),
  );
}

function decodeSeed(seedBase64: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(seedBase64) || seedBase64.length % 4 !== 0) {
    throw new Error('Invalid --seed-base64');
  }
  const seed = Buffer.from(seedBase64, 'base64');
  if (seed.length !== 32) {
    throw new Error(`Invalid --seed-base64 length: expected 32 bytes, got ${seed.length}`);
  }
  return new Uint8Array(seed);
}

function getPubkeyHex(options: Pick<RegisterEnclavePubkeyOptions, 'pubkeyHex' | 'seedBase64'>) {
  if (options.pubkeyHex) {
    return normalizeHex(options.pubkeyHex, 'pubkey', 32);
  }

  const seed = decodeSeed(options.seedBase64!);
  return `0x${Buffer.from(ed25519.getPublicKey(seed)).toString('hex')}`;
}

export function registerEnclavePubkeyMainnet(input: RegisterEnclavePubkeyOptions) {
  const options = {
    packageId: input.packageId,
    enclaveRegistryId: input.enclaveRegistryId,
    pubkeyHex: input.pubkeyHex,
    seedBase64: input.seedBase64,
    gasBudget: input.gasBudget ?? '50000000',
    sender: input.sender,
    dryRun: input.dryRun ?? false,
    executeMainnet: input.executeMainnet ?? false,
    confirmMainnet: input.confirmMainnet ?? false,
    clientConfig: input.clientConfig,
  };

  if (!options.packageId) {
    throw new Error('Missing --package-id');
  }
  if (!options.enclaveRegistryId) {
    throw new Error('Missing --enclave-registry-id');
  }
  if (Boolean(options.pubkeyHex) === Boolean(options.seedBase64)) {
    throw new Error('Provide exactly one of --pubkey-hex or --seed-base64');
  }
  if (options.executeMainnet && !options.confirmMainnet) {
    throw new Error('Refusing to execute without --confirm-mainnet');
  }
  if (options.executeMainnet && options.dryRun) {
    throw new Error('Choose either --dry-run or --execute-mainnet, not both');
  }

  const packageId = normalizeHex(options.packageId, 'package id');
  const enclaveRegistryId = normalizeHex(options.enclaveRegistryId, 'enclave registry id');
  const pubkeyHex = getPubkeyHex(options);

  const commandArgs = options.clientConfig
    ? ['client', '--client.config', options.clientConfig, 'call']
    : ['client', 'call'];
  commandArgs.push(
    '--package',
    packageId,
    '--module',
    'nautilus_verifier',
    '--function',
    'register_pubkey',
    '--args',
    enclaveRegistryId,
    pubkeyHex,
    '--gas-budget',
    options.gasBudget,
  );

  if (options.sender) {
    commandArgs.push('--sender', normalizeHex(options.sender, 'sender address'));
  }

  const printableCommand = formatCommand('sui', [...commandArgs, '--json']);

  if (!options.dryRun && !options.executeMainnet) {
    return {
      packageId,
      enclaveRegistryId,
      pubkeyHex,
      suggestedDryRun: `${printableCommand} --dry-run`,
      suggestedExecution: printableCommand,
    };
  }

  ensureActiveMainnet(options.clientConfig);

  if (options.dryRun) {
    commandArgs.push('--dry-run');
  }
  commandArgs.push('--json');

  const result = runCommand('sui', commandArgs);
  if (result.status !== 0) {
    throw new Error(`register_pubkey failed: ${formatCommand('sui', commandArgs)}`);
  }

  const payload = extractJsonFromOutput(result.stdout) as Record<string, unknown>;
  if (options.executeMainnet) {
    assertSuiEffectsSuccess(payload, 'register_pubkey');
  }
  const effects = (payload.effects ?? {}) as Record<string, unknown>;
  return {
    packageId,
    enclaveRegistryId,
    pubkeyHex,
    registrationTxDigest: String(effects.transactionDigest ?? ''),
    raw: payload,
  };
}

function parseCliArgs(argv: string[]) {
  const args = argv.filter((arg) => arg !== '--');
  const options: Record<string, string | boolean | undefined> = {
    dryRun: false,
    executeMainnet: false,
    confirmMainnet: false,
    wantsJson: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') return { wantsHelp: true };
    if (arg === '--package-id') options.packageId = args[++index];
    else if (arg === '--enclave-registry-id') options.enclaveRegistryId = args[++index];
    else if (arg === '--pubkey-hex') options.pubkeyHex = args[++index];
    else if (arg === '--seed-base64') options.seedBase64 = args[++index];
    else if (arg === '--gas-budget') options.gasBudget = args[++index];
    else if (arg === '--sender') options.sender = args[++index];
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--execute-mainnet') options.executeMainnet = true;
    else if (arg === '--confirm-mainnet') options.confirmMainnet = true;
    else if (arg === '--json') options.wantsJson = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return { wantsHelp: false, ...options };
}

function main() {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.wantsHelp) {
    printUsage();
    process.exit(0);
  }

  try {
    const result = registerEnclavePubkeyMainnet({
      packageId: parsed.packageId as string,
      enclaveRegistryId: parsed.enclaveRegistryId as string,
      pubkeyHex: parsed.pubkeyHex as string | undefined,
      seedBase64: parsed.seedBase64 as string | undefined,
      gasBudget: parsed.gasBudget as string | undefined,
      sender: parsed.sender as string | undefined,
      dryRun: Boolean(parsed.dryRun),
      executeMainnet: Boolean(parsed.executeMainnet),
      confirmMainnet: Boolean(parsed.confirmMainnet),
    });

    if (parsed.wantsJson) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if ('suggestedDryRun' in result) {
      console.log(
        [
          `Package ID: ${result.packageId}`,
          `Enclave registry ID: ${result.enclaveRegistryId}`,
          `Public key: ${result.pubkeyHex}`,
          `Dry-run: ${result.suggestedDryRun}`,
          `Execute: ${result.suggestedExecution}`,
        ].join('\n'),
      );
      return;
    }

    console.log(
      [
        'Enclave pubkey registration completed.',
        `Public key: ${result.pubkeyHex}`,
        `Tx digest: ${result.registrationTxDigest}`,
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
