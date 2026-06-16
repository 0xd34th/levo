import { describe, expect, it } from 'vitest';
import { computeAprBps } from '@/lib/stable-layer-apr';

describe('computeAprBps', () => {
  it('derives the real mainnet APR (~6.93%) from on-chain values', () => {
    // Snapshot of the StableLayer YieldVault on Sui mainnet:
    // flow_rate is USDB base units per millisecond (1e18 Double offset),
    // total_supply is yesUSDB (6 decimals, same as USDB).
    const result = computeAprBps({
      flowRateRaw: 861969444444444444n,
      totalSupply: 392211368430n,
    });
    expect(result.aprReliable).toBe(true);
    expect(result.aprBps).toBe(693); // 6.93%
  });

  it('marks APR unreliable when total supply is zero', () => {
    expect(computeAprBps({ flowRateRaw: 861969444444444444n, totalSupply: 0n })).toEqual({
      aprBps: 0,
      aprReliable: false,
    });
  });

  it('marks APR unreliable when flow rate is zero (idle buffer)', () => {
    expect(computeAprBps({ flowRateRaw: 0n, totalSupply: 392211368430n })).toEqual({
      aprBps: 0,
      aprReliable: false,
    });
  });

  it('rejects implausibly high APR (guards against decimal/offset drift)', () => {
    // A flow rate 1000x too large (e.g. if it were misread as per-second) would
    // blow past the 100% ceiling and be flagged unreliable rather than shown.
    const result = computeAprBps({
      flowRateRaw: 861969444444444444000n,
      totalSupply: 392211368430n,
    });
    expect(result.aprReliable).toBe(false);
    expect(result.aprBps).toBe(0);
  });

  it('accepts a plausible double-digit APR', () => {
    // ~15% on the same TVL.
    const result = computeAprBps({
      flowRateRaw: 1_866_000_000_000_000_000n,
      totalSupply: 392211368430n,
    });
    expect(result.aprReliable).toBe(true);
    expect(result.aprBps).toBeGreaterThan(1400);
    expect(result.aprBps).toBeLessThan(1600);
  });
});
