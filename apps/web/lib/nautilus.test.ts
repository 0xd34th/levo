import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestAttestation } from './nautilus';

describe('requestAttestation', () => {
  const fetchMock = vi.fn();
  const signerSecret = '12345678901234567890123456789012';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-17T00:00:00.000Z'));
    vi.stubEnv('NAUTILUS_ENCLAVE_URL', 'https://enclave.example');
    vi.stubEnv('NAUTILUS_SIGNER_SECRET', signerSecret);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('forwards the signer bearer secret when requesting an attestation', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          signature: '0x1234',
          x_user_id: '12345',
          sui_address: '0x2',
          nonce: '1',
          expires_at: String(Date.now() + 60_000),
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    await requestAttestation({
      xUserId: '12345',
      suiAddress: '0x2',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${signerSecret}`,
    });
  });

  it('throws a configuration error when the signer secret is missing', async () => {
    vi.stubEnv('NAUTILUS_SIGNER_SECRET', '');

    await expect(
      requestAttestation({
        xUserId: '12345',
        suiAddress: '0x2',
      }),
    ).rejects.toThrow('Nautilus signer secret not configured');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws a configuration error when the signer secret is too short', async () => {
    vi.stubEnv('NAUTILUS_SIGNER_SECRET', 'too-short');

    await expect(
      requestAttestation({
        xUserId: '12345',
        suiAddress: '0x2',
      }),
    ).rejects.toThrow('Nautilus signer secret not configured');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows loopback http attestation requests in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NAUTILUS_ENCLAVE_URL', 'http://127.0.0.1:8787');
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          signature: '0x1234',
          x_user_id: '12345',
          sui_address: '0x2',
          nonce: '1',
          expires_at: String(Date.now() + 60_000),
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    await requestAttestation({
      xUserId: '12345',
      suiAddress: '0x2',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8787/attestation');
  });

  it('rejects non-loopback http attestation requests in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NAUTILUS_ENCLAVE_URL', 'http://enclave.example');

    await expect(
      requestAttestation({
        xUserId: '12345',
        suiAddress: '0x2',
      }),
    ).rejects.toThrow('Nautilus enclave URL must use HTTPS in production');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects expired or nearly expired attestations before claim execution', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          signature: '0x1234',
          x_user_id: '12345',
          sui_address: '0x2',
          nonce: '1',
          expires_at: String(Date.now() + 10_000),
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

  it('rejects attestations that return an unexpected X user id', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          signature: '0x1234',
          x_user_id: '54321',
          sui_address: '0x2',
          nonce: '1',
          expires_at: String(Date.now() + 60_000),
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
    ).rejects.toThrow('Attestation response contained an unexpected X user id');
  });
});
