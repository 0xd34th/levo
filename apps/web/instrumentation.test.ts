import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getGasStationAddressMock } = vi.hoisted(() => ({
  getGasStationAddressMock: vi.fn(),
}));

vi.mock('@/lib/gas-station', () => ({
  getGasStationAddress: getGasStationAddressMock,
}));

import { register } from './instrumentation';

describe('register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('PRIVY_APP_SECRET', 'privy-app-secret');
    vi.stubEnv('HMAC_SECRET', 'x'.repeat(64));
    getGasStationAddressMock.mockReturnValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('starts without requiring legacy Nautilus env vars', async () => {
    await expect(register()).resolves.toBeUndefined();
  });
});
