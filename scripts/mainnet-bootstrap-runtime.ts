import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface IsolatedSuiContext {
  tempDir: string;
  clientConfig: string;
  keystorePath: string;
  deployerAddress: string;
  cleanup(): void;
}

export function shellQuote(arg: string): string {
  return /^[A-Za-z0-9_@./:=+-]+$/.test(arg)
    ? arg
    : `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function normalizeHex(value: string, label: string, expectedBytes?: number) {
  const hex = value.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error(`Invalid ${label}`);
  }
  if (expectedBytes && hex.length !== expectedBytes * 2) {
    throw new Error(`Invalid ${label}: expected ${expectedBytes} bytes`);
  }
  return `0x${hex.toLowerCase()}`;
}

export function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {},
): CommandResult {
  const spawnOptions: SpawnSyncOptionsWithStringEncoding = {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
  };
  const result = spawnSync(command, args, spawnOptions);

  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

export function formatCommand(command: string, args: string[]) {
  return [command, ...args].map(shellQuote).join(' ');
}

export function renderCommandOutput(result: CommandResult) {
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

export function assertCommandSucceeded(
  result: CommandResult,
  context: string,
  command?: string,
) {
  if (result.status === 0) {
    return;
  }

  renderCommandOutput(result);
  throw new Error(command ? `${context} failed: ${command}` : `${context} failed`);
}

export function extractJsonFromOutput(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Missing JSON output');
  }

  const candidateIndexes: number[] = [];
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === '{' || char === '[') {
      candidateIndexes.push(index);
    }
  }

  for (const index of candidateIndexes) {
    const candidate = trimmed.slice(index);
    try {
      return JSON.parse(candidate);
    } catch {
      // Keep scanning for the real JSON start.
    }
  }

  throw new Error('Unable to parse JSON output');
}

function parseKeystorePathFromClientConfig(clientConfigContents: string) {
  let inKeystoreBlock = false;
  for (const line of clientConfigContents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === 'keystore:') {
      inKeystoreBlock = true;
      continue;
    }
    if (inKeystoreBlock && !line.startsWith(' ')) {
      inKeystoreBlock = false;
    }
    if (inKeystoreBlock && trimmed.startsWith('File: ')) {
      return trimmed.slice('File: '.length).trim().replace(/^['"]|['"]$/g, '');
    }
  }

  throw new Error('Failed to locate keystore path in default Sui config');
}

function setMainnetRpcInClientConfig(clientConfig: string, rpcUrl: string, keystorePath: string) {
  const current = readFileSync(clientConfig, 'utf8');
  const lines = current.split(/\r?\n/);
  let inMainnetBlock = false;
  let inKeystoreBlock = false;
  let replaced = false;
  let replacedKeystore = false;
  const next = lines.map((line) => {
    const trimmed = line.trim();
    const indent = line.slice(0, line.length - line.trimStart().length);

    if (trimmed === 'keystore:') {
      inKeystoreBlock = true;
      return line;
    }
    if (inKeystoreBlock && !line.startsWith(' ')) {
      inKeystoreBlock = false;
    }

    if (inKeystoreBlock && trimmed.startsWith('File: ')) {
      replacedKeystore = true;
      return `${indent}File: ${keystorePath}`;
    }

    if (trimmed === '- alias: mainnet') {
      inMainnetBlock = true;
      return line;
    }

    if (inMainnetBlock && trimmed.startsWith('- alias: ') && trimmed !== '- alias: mainnet') {
      inMainnetBlock = false;
    }

    if (inMainnetBlock && trimmed.startsWith('rpc: ')) {
      replaced = true;
      return `${line.slice(0, line.indexOf('r'))}rpc: "${rpcUrl}"`;
    }

    return line;
  }).join('\n');

  if (!replaced) {
    throw new Error('Failed to update mainnet RPC in temporary Sui config');
  }
  if (!replacedKeystore) {
    throw new Error('Failed to update keystore path in temporary Sui config');
  }

  writeFileSync(clientConfig, `${next}\n`);
}

function setActiveAddressInClientConfig(input: {
  clientConfig: string;
  deployerAddress: string;
}) {
  const current = readFileSync(input.clientConfig, 'utf8');
  let replacedActiveEnv = false;
  let replacedActiveAddress = false;
  const lines = current.split(/\r?\n/).map((line) => {
    if (line.startsWith('active_env: ')) {
      replacedActiveEnv = true;
      return 'active_env: mainnet';
    }
    if (line.startsWith('active_address: ')) {
      replacedActiveAddress = true;
      return `active_address: "${input.deployerAddress}"`;
    }
    return line;
  });
  if (!replacedActiveEnv) {
    lines.push('active_env: mainnet');
  }
  if (!replacedActiveAddress) {
    lines.push(`active_address: "${input.deployerAddress}"`);
  }
  writeFileSync(input.clientConfig, `${lines.join('\n')}\n`);
}

export function createIsolatedSuiContext(input: {
  deployerPrivateKey: string;
  rpcUrl: string;
}): IsolatedSuiContext {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'levo-mainnet-bootstrap-'));
  const clientConfig = path.join(tempDir, 'client.yaml');
  const keystorePath = path.join(tempDir, 'sui.keystore');
  const deriveKeystorePath = path.join(tempDir, 'derive.keystore');
  const importAlias = `bootstrap-deployer-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const defaultClientConfig = path.join(os.homedir(), '.sui', 'sui_config', 'client.yaml');
  if (!existsSync(defaultClientConfig)) {
    throw new Error(`Missing default Sui client config: ${defaultClientConfig}`);
  }
  const defaultClientConfigContents = readFileSync(defaultClientConfig, 'utf8');
  const defaultKeystorePath = parseKeystorePathFromClientConfig(defaultClientConfigContents);
  if (!existsSync(defaultKeystorePath)) {
    throw new Error(`Missing default Sui keystore: ${defaultKeystorePath}`);
  }

  copyFileSync(defaultClientConfig, clientConfig);
  copyFileSync(defaultKeystorePath, keystorePath);
  setMainnetRpcInClientConfig(clientConfig, input.rpcUrl, keystorePath);

  const deriveResult = runCommand('sui', [
    'keytool',
    '--keystore-path',
    deriveKeystorePath,
    'import',
    input.deployerPrivateKey,
    'ed25519',
    '--alias',
    importAlias,
    '--json',
  ]);
  assertCommandSucceeded(deriveResult, 'Deriving deployer address');
  const imported = extractJsonFromOutput(deriveResult.stdout) as Record<string, unknown>;
  const deployerAddress = String(imported.suiAddress || '');
  if (!deployerAddress) {
    throw new Error('Missing deployer address from key import output');
  }

  const existingKeyResult = runCommand('sui', [
    'keytool',
    '--keystore-path',
    keystorePath,
    'export',
    '--key-identity',
    deployerAddress,
    '--json',
  ]);

  if (existingKeyResult.status !== 0) {
    const importResult = runCommand('sui', [
      'keytool',
      '--keystore-path',
      keystorePath,
      'import',
      input.deployerPrivateKey,
      'ed25519',
      '--alias',
      importAlias,
      '--json',
    ]);
    assertCommandSucceeded(importResult, 'Importing deployer private key');
  }

  setActiveAddressInClientConfig({
    clientConfig,
    deployerAddress,
  });

  return {
    tempDir,
    clientConfig,
    keystorePath,
    deployerAddress,
    cleanup() {
      rmSync(deriveKeystorePath, { force: true });
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

export function ensureActiveMainnet(clientConfig?: string) {
  const args = clientConfig
    ? ['client', '--client.config', clientConfig, 'active-env']
    : ['client', 'active-env'];
  const result = runCommand('sui', args);
  assertCommandSucceeded(result, 'Checking active Sui environment');

  if (result.stdout.trim() !== 'mainnet') {
    throw new Error(`Refusing to proceed because active Sui env is ${result.stdout.trim() || '<empty>'}, not mainnet.`);
  }
}

export function runSuiClientJson(
  clientArgs: string[],
  options: { clientConfig?: string; cwd?: string } = {},
) {
  const args = options.clientConfig
    ? ['client', '--client.config', options.clientConfig, ...clientArgs, '--json']
    : ['client', ...clientArgs, '--json'];
  const result = runCommand('sui', args, { cwd: options.cwd });
  assertCommandSucceeded(result, `Running sui ${clientArgs[0] ?? 'client'}`);
  return {
    result,
    json: extractJsonFromOutput(result.stdout),
  };
}

export function queryObjectExists(objectId: string, clientConfig?: string) {
  const args = clientConfig
    ? ['client', '--client.config', clientConfig, 'object', objectId, '--json']
    : ['client', 'object', objectId, '--json'];
  const result = runCommand('sui', args);
  if (result.status !== 0) {
    return false;
  }

  try {
    const json = extractJsonFromOutput(result.stdout) as Record<string, unknown>;
    return Boolean(json.data);
  } catch {
    return false;
  }
}
