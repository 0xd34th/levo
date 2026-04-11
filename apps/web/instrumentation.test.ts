import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  formatGasStationHealthSummaryMock,
  getGasStationAddressMock,
  getGasStationHealthSummaryMock,
} = vi.hoisted(() => ({
  formatGasStationHealthSummaryMock: vi.fn(),
  getGasStationAddressMock: vi.fn(),
  getGasStationHealthSummaryMock: vi.fn(),
}));

vi.mock('@/lib/gas-station', () => ({
  getGasStationAddress: getGasStationAddressMock,
}));

vi.mock('@/lib/gas-station-maintenance', () => ({
  formatGasStationHealthSummary: formatGasStationHealthSummaryMock,
  getGasStationHealthSummary: getGasStationHealthSummaryMock,
}));

import { register } from './instrumentation';

describe('register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('PRIVY_APP_SECRET', 'privy-app-secret');
    vi.stubEnv('HMAC_SECRET', 'x'.repeat(64));
    getGasStationAddressMock.mockReturnValue(null);
    getGasStationHealthSummaryMock.mockResolvedValue({
      address: '0xgasstation',
      coinCount: 1,
      totalBalance: 1_000_000_000n,
      largestCoinBalance: 1_000_000_000n,
      smallestCoinBalance: 1_000_000_000n,
      warnings: [],
    });
    formatGasStationHealthSummaryMock.mockReturnValue([
      'Address: 0xgasstation',
      'Total SUI: 1.0000 (1 coin; largest 1.0000, smallest 1.0000)',
      'Commands: pnpm --dir apps/web gas-station:status | pnpm --dir apps/web gas-station:merge',
    ]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('starts without requiring legacy Nautilus env vars', async () => {
    await expect(register()).resolves.toBeUndefined();
  });

  it('logs gas station health details when the gas station is configured', async () => {
    getGasStationAddressMock.mockReturnValue('0xgasstation');

    await expect(register()).resolves.toBeUndefined();

    // Address is logged synchronously during startup
    expect(console.log).toHaveBeenCalledWith('[gas-station] Sui address: 0xgasstation');

    // Health probe is fire-and-forget — flush microtask queue
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getGasStationHealthSummaryMock).toHaveBeenCalledWith('0xgasstation');
    expect(formatGasStationHealthSummaryMock).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith('[gas-station] Address: 0xgasstation');
    expect(console.log).toHaveBeenCalledWith(
      '[gas-station] Total SUI: 1.0000 (1 coin; largest 1.0000, smallest 1.0000)',
    );
    expect(console.log).toHaveBeenCalledWith(
      '[gas-station] Commands: pnpm --dir apps/web gas-station:status | pnpm --dir apps/web gas-station:merge',
    );
  });
});
