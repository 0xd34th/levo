import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getGasStationAddressMock } = vi.hoisted(() => ({
  getGasStationAddressMock: vi.fn(),
}));

vi.mock('@/lib/gas-station', () => ({
  getGasStationAddress: getGasStationAddressMock,
}));

import { register } from './instrumentation';

describe('register', () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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

  it('warns instead of crashing startup when the Nautilus signer secret is missing', async () => {
    vi.stubEnv('NAUTILUS_SIGNER_SECRET', '');

    await expect(register()).resolves.toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[nautilus] Claim signing disabled (NAUTILUS_SIGNER_SECRET missing or too short)',
    );
  });

  it('accepts a valid Nautilus signer secret', async () => {
    vi.stubEnv('NAUTILUS_SIGNER_SECRET', 'y'.repeat(32));

    await expect(register()).resolves.toBeUndefined();
  });
});
