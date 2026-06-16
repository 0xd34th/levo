import { getStableLayerConstants } from '@/lib/stable-layer';
import { getSuiClient } from '@/lib/sui';

/**
 * StableLayer yield APR, derived from the on-chain YieldVault.
 *
 * The vault buffers harvested USDB yield and releases it linearly at
 * `buffer.flow_rate` (a `bucket_v2_framework::double::Double`, u256 fixed-point
 * with a 1e18 offset). The release rate is denominated in USDB **base units per
 * millisecond** — `buffer.timestamp` is a Sui Clock value in ms, and
 * `releasable_amount = mul_u64(flow_rate, now_ms - timestamp_ms)`.
 *
 * Annualised yield (USDB base units) = flow_rate / 1e18 * MS_PER_YEAR.
 * Dividing by the vault LP total supply (yesUSDB, same 6 decimals as USDB) gives
 * a unitless APR. Verified against mainnet: flow_rate releases the buffer over
 * ~60 min (hourly harvest) and yields ≈6.9% on ~$392k TVL.
 */

// Bucket v2 `double::Double` fixed-point offset (== @bucket-protocol/sdk DOUBLE_OFFSET).
const DOUBLE_OFFSET = 10n ** 18n;
// Milliseconds per year (365 * 86400 * 1000) — flow_rate is per-millisecond.
const MILLISECONDS_PER_YEAR = 31_536_000_000n;
const BPS_SCALE = 10_000n;
// Plausible APR ceiling (100%). Guards against decimal/offset drift producing
// an off-by-orders-of-magnitude value.
const MAX_PLAUSIBLE_APR_BPS = 10_000;

const APR_CACHE_TTL_MS = 60_000;

export interface StableLayerApr {
  aprBps: number;
  aprReliable: boolean;
}

const UNRELIABLE_APR: StableLayerApr = { aprBps: 0, aprReliable: false };

interface CachedApr {
  expiresAt: number;
  value: StableLayerApr;
}

const aprCache = new Map<string, CachedApr>();

/**
 * Pure APR computation from the raw on-chain values. Exported for unit tests.
 * Returns basis points (e.g. 693 = 6.93%) plus a reliability flag.
 */
export function computeAprBps(params: {
  flowRateRaw: bigint;
  totalSupply: bigint;
}): StableLayerApr {
  const { flowRateRaw, totalSupply } = params;

  if (totalSupply <= 0n || flowRateRaw <= 0n) {
    return UNRELIABLE_APR;
  }

  const aprBpsBig = (flowRateRaw * MILLISECONDS_PER_YEAR * BPS_SCALE) / (DOUBLE_OFFSET * totalSupply);
  const aprBps = Number(aprBpsBig);

  if (!Number.isFinite(aprBps) || aprBps < 0 || aprBps > MAX_PLAUSIBLE_APR_BPS) {
    return UNRELIABLE_APR;
  }

  return { aprBps, aprReliable: true };
}

function readNestedString(root: unknown, path: readonly string[]): string | null {
  let cursor: unknown = root;
  for (const key of path) {
    if (cursor == null || typeof cursor !== 'object') {
      return null;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  if (typeof cursor === 'string') return cursor;
  if (typeof cursor === 'number' || typeof cursor === 'bigint') return String(cursor);
  return null;
}

function parseBigIntOrNull(value: string | null): bigint | null {
  if (value === null) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/**
 * Read the StableLayer YieldVault and derive the current APR.
 * Cached in-process for {@link APR_CACHE_TTL_MS} since it is a global (per-vault)
 * value. Never throws: on any read/parse failure returns an unreliable APR so
 * the Earn summary endpoint stays up.
 */
export async function getStableLayerApr(): Promise<StableLayerApr> {
  let vaultId: string;
  try {
    vaultId = getStableLayerConstants().YIELD_VAULT;
  } catch {
    return UNRELIABLE_APR;
  }

  const now = Date.now();
  const cached = aprCache.get(vaultId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  let value: StableLayerApr;
  try {
    const response = await getSuiClient().getObject({
      id: vaultId,
      options: { showContent: true },
    });

    const fields = (response.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
    const flowRateRaw = parseBigIntOrNull(
      readNestedString(fields, ['buffer', 'fields', 'flow_rate', 'fields', 'value']),
    );
    const totalSupply = parseBigIntOrNull(
      readNestedString(fields, ['lp_treasury_cap', 'fields', 'total_supply', 'fields', 'value']),
    );

    value =
      flowRateRaw === null || totalSupply === null
        ? UNRELIABLE_APR
        : computeAprBps({ flowRateRaw, totalSupply });
  } catch (error) {
    console.error('Failed to read StableLayer APR', error);
    value = UNRELIABLE_APR;
  }

  aprCache.set(vaultId, { expiresAt: now + APR_CACHE_TTL_MS, value });
  return value;
}
