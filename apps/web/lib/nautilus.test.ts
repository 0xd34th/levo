import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestAttestation } from './nautilus';

describe('requestAttestation', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T00:00:00.000Z'));
    vi.stubEnv('NAUTILUS_ENCLAVE_URL', 'https://enclave.example');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('rejects expired or nearly expired attestations before claim execution', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          signature: '0x1234',
          x_user_id: '12345',
          sui_address: '0x2',
          nonce: '1',
          expires_at: String(Math.floor(Date.now() / 1000) + 10),
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    await expect(
      requestAttestation({
        xUserId: '12345',
        suiAddress: '0x2',
      }),
    ).rejects.toThrow('Attestation already expired or expiring too soon');
  });
});
