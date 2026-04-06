export interface BootstrapDecisionInput {
  forceRedeploy: boolean;
  contractsValid: boolean;
  activeLevoValid: boolean;
  signerRegistered: boolean;
}

export interface BootstrapActions {
  publishContracts: boolean;
  publishLevoUsd: boolean;
  onboardLevoUsd: boolean;
  addEntity: boolean;
  registerSigner: boolean;
}

type JsonRecord = Record<string, unknown>;

type DeploymentLike = {
  history?: {
    runs?: Array<Record<string, unknown>>;
  };
  contracts?: Record<string, unknown>;
  stableLayer?: Record<string, unknown> & {
    activeLevoUsd?: Record<string, unknown>;
  };
  signer?: Record<string, unknown>;
  [key: string]: unknown;
};

function asRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return value as JsonRecord;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing ${label}`);
  }

  return value;
}

function asByteArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'number' || entry < 0 || entry > 255)) {
    throw new Error(`Invalid ${label}`);
  }

  return value as number[];
}

function readUleb128(bytes: number[], startOffset: number, label: string) {
  let value = 0;
  let shift = 0;
  let offset = startOffset;

  while (offset < bytes.length) {
    const byte = bytes[offset]!;
    value |= (byte & 0x7f) << shift;
    offset += 1;
    if ((byte & 0x80) === 0) {
      return { value, offset };
    }
    shift += 7;
  }

  throw new Error(`Invalid ${label}`);
}

function bytesToHex(bytes: number[]) {
  return `0x${Buffer.from(bytes).toString('hex')}`;
}

export function getSuiEffectsStatus(payload: unknown) {
  const root = asRecord(payload, 'sui payload');
  const effects = asRecord(root.effects, 'effects');
  const status = asRecord(effects.status, 'effects.status');
  const statusValue = asString(status.status, 'effects.status.status');
  const error = typeof status.error === 'string'
    ? status.error
    : (effects.abortError ? JSON.stringify(effects.abortError) : '');

  return {
    status: statusValue,
    error,
  };
}

export function assertSuiEffectsSuccess(payload: unknown, context: string) {
  const { status, error } = getSuiEffectsStatus(payload);
  if (status === 'success') {
    return;
  }

  if (error) {
    throw new Error(`${context} failed on-chain: ${error}`);
  }

  throw new Error(`${context} failed on-chain`);
}

export function extractEnclaveRegistryPubkeys(payload: unknown) {
  const root = asRecord(payload, 'enclave registry object payload');
  const data = asRecord(root.data, 'object.data');
  const move = asRecord(data.Move, 'object.data.Move');
  const contents = asByteArray(move.contents, 'object.data.Move.contents');

  if (contents.length < 65) {
    throw new Error('Invalid enclave registry contents');
  }

  let offset = 0;
  offset += 32; // UID / object id
  offset += 32; // admin address
  offset += 1; // paused flag

  const { value: pubkeyCount, offset: afterCount } = readUleb128(contents, offset, 'pubkey count');
  offset = afterCount;

  const pubkeys: string[] = [];
  for (let index = 0; index < pubkeyCount; index += 1) {
    const { value: pubkeyLength, offset: afterLength } = readUleb128(contents, offset, `pubkey length ${index}`);
    offset = afterLength;
    if (offset + pubkeyLength > contents.length) {
      throw new Error('Invalid enclave registry pubkey bytes');
    }

    pubkeys.push(bytesToHex(contents.slice(offset, offset + pubkeyLength)));
    offset += pubkeyLength;
  }

  return pubkeys;
}

function findObjectChange(
  changes: unknown,
  predicate: (change: JsonRecord) => boolean,
  label: string,
) {
  if (!Array.isArray(changes)) {
    throw new Error('Missing objectChanges');
  }

  const match = changes.find((change) => {
    try {
      return predicate(asRecord(change, label));
    } catch {
      return false;
    }
  });
  if (!match) {
    throw new Error(`Missing ${label}`);
  }

  return asRecord(match, label);
}

export function decideBootstrapActions(input: BootstrapDecisionInput): BootstrapActions {
  if (input.forceRedeploy) {
    return {
      publishContracts: true,
      publishLevoUsd: true,
      onboardLevoUsd: true,
      addEntity: true,
      registerSigner: true,
    };
  }

  const publishContracts = !input.contractsValid;
  const publishLevoUsd = publishContracts || !input.activeLevoValid;
  const registerSigner = publishContracts || !input.signerRegistered;

  return {
    publishContracts,
    publishLevoUsd,
    onboardLevoUsd: publishLevoUsd,
    addEntity: publishLevoUsd,
    registerSigner,
  };
}

export function quoteEnvValue(value: string): string {
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')}"`;
}

export function upsertEnvFileContent(
  content: string,
  updates: Record<string, string>,
): string {
  const lines = content.split(/\r?\n/);
  const seen = new Set<string>();
  const output = lines.map((line) => {
    const match = /^([A-Z0-9_]+)=.*$/.exec(line.trim());
    if (!match?.[1]) {
      return line;
    }

    const key = match[1];
    if (!(key in updates)) {
      return line;
    }

    seen.add(key);
    return `${key}=${quoteEnvValue(updates[key]!)}`;
  });

  const missingEntries = Object.entries(updates)
    .filter(([key]) => !seen.has(key))
    .map(([key, value]) => `${key}=${quoteEnvValue(value)}`);

  if (missingEntries.length === 0) {
    return output.join('\n');
  }

  const needsSpacer = output.length > 0 && output[output.length - 1] !== '';
  return [
    ...output,
    ...(needsSpacer ? [''] : []),
    ...missingEntries,
  ].join('\n');
}

export function extractContractsPublishResult(payload: unknown) {
  assertSuiEffectsSuccess(payload, 'Contracts publish');
  const root = asRecord(payload, 'contracts publish payload');
  const effects = asRecord(root.effects, 'effects');
  const objectChanges = root.objectChanges;

  const published = findObjectChange(
    objectChanges,
    (change) => change.type === 'published',
    'published package',
  );
  const xVaultRegistry = findObjectChange(
    objectChanges,
    (change) => asString(change.objectType, 'xvault object type').endsWith('::x_vault::XVaultRegistry'),
    'xvault registry',
  );
  const enclaveRegistry = findObjectChange(
    objectChanges,
    (change) => asString(change.objectType, 'enclave object type').endsWith('::nautilus_verifier::EnclaveRegistry'),
    'enclave registry',
  );
  const upgradeCap = findObjectChange(
    objectChanges,
    (change) => change.objectType === '0x2::package::UpgradeCap',
    'upgrade cap',
  );

  return {
    publishTxDigest: asString(effects.transactionDigest, 'transaction digest'),
    packageId: asString(published.packageId, 'package id'),
    xVaultRegistryId: asString(xVaultRegistry.objectId, 'xvault registry id'),
    enclaveRegistryId: asString(enclaveRegistry.objectId, 'enclave registry id'),
    upgradeCapId: asString(upgradeCap.objectId, 'upgrade cap id'),
  };
}

export function extractLevoUsdPublishResult(payload: unknown) {
  assertSuiEffectsSuccess(payload, 'Standalone LevoUSD publish');
  const root = asRecord(payload, 'levo-usd publish payload');
  const effects = asRecord(root.effects, 'effects');
  const objectChanges = root.objectChanges;
  const published = findObjectChange(
    objectChanges,
    (change) => change.type === 'published',
    'published package',
  );
  const publishPackageId = asString(published.packageId, 'package id');
  const coinType = `${publishPackageId}::levo_usd::LEVO_USD`;
  const treasuryCap = findObjectChange(
    objectChanges,
    (change) => asString(change.objectType, 'treasury cap type') === `0x2::coin::TreasuryCap<${coinType}>`,
    'treasury cap',
  );
  const currency = findObjectChange(
    objectChanges,
    (change) => asString(change.objectType, 'currency type') === `0x2::coin_registry::Currency<${coinType}>`,
    'currency',
  );

  return {
    publishTxDigest: asString(effects.transactionDigest, 'transaction digest'),
    publishPackageId,
    treasuryCapId: asString(treasuryCap.objectId, 'treasury cap id'),
    currencyId: asString(currency.objectId, 'currency id'),
    coinType,
  };
}

export function classifyRegisterPubkeyDryRun(payload: unknown) {
  const root = asRecord(payload, 'register_pubkey dry-run payload');
  const effects = asRecord(root.effects, 'effects');
  const status = asRecord(effects.status, 'effects.status');

  if (status.status === 'success') {
    return 'missing';
  }

  const abortError = asRecord(effects.abortError, 'abortError');
  if (
    typeof abortError.module_id === 'string'
    && abortError.module_id.endsWith('::nautilus_verifier')
    && abortError.function === 'register_pubkey'
    && abortError.error_code === 3
  ) {
    return 'already_registered';
  }

  return 'unexpected_failure';
}

export function sumGasMistBalance(payload: Array<{ mistBalance: string | number | bigint }>) {
  return payload.reduce((sum, coin) => sum + BigInt(coin.mistBalance), 0n);
}

export function appendDeploymentHistory(
  currentState: DeploymentLike,
  entry: { timestamp: string; reason: string },
) {
  const nextState = structuredClone(currentState) as DeploymentLike;
  const previous = {
    contracts: currentState.contracts ? structuredClone(currentState.contracts) : undefined,
    stableLayer: currentState.stableLayer
      ? {
        activeLevoUsd: currentState.stableLayer.activeLevoUsd
          ? structuredClone(currentState.stableLayer.activeLevoUsd)
          : undefined,
      }
      : undefined,
    signer: currentState.signer ? structuredClone(currentState.signer) : undefined,
  };

  nextState.history ??= { runs: [] };
  nextState.history.runs ??= [];
  nextState.history.runs.push({
    timestamp: entry.timestamp,
    reason: entry.reason,
    previous,
  });

  return nextState;
}
