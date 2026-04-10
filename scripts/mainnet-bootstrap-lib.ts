type JsonRecord = Record<string, unknown>;

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
