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

  it('warns when Nautilus enclave URL is missing', async () => {
    vi.stubEnv('NAUTILUS_ENCLAVE_URL', '');

    await expect(register()).resolves.toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[nautilus] Enclave not configured (NAUTILUS_ENCLAVE_URL missing)',
    );
  });

  it('accepts a configured Nautilus enclave URL', async () => {
    vi.stubEnv('NAUTILUS_ENCLAVE_URL', 'http://localhost:3000');

    await expect(register()).resolves.toBeUndefined();
  });
});
