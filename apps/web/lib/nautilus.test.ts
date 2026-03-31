import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestAttestation } from './nautilus';

describe('requestAttestation', () => {
  const fetchMock = vi.fn();

  const validResponse = {
    signature: '0x1234',
    x_user_id: '12345',
    sui_address: '0x0000000000000000000000000000000000000000000000000000000000000002',
    nonce: '1',
    expires_at: String(Date.now() + 60_000),
    intent_scope: 0,
    timestamp_ms: Date.now(),
    registry_id: '0x0000000000000000000000000000000000000000000000000000000000000001',
  };

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

  it('sends request to /process_data with payload envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(validResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await requestAttestation({ xUserId: '12345', suiAddress: '0x2' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://enclave.example/process_data');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    const body = JSON.parse(init?.body as string);
    expect(body.payload).toBeDefined();
    expect(body.payload.x_user_id).toBe('12345');
  });

  it('returns intentScope and timestampMs from enclave response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(validResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await requestAttestation({ xUserId: '12345', suiAddress: '0x2' });
    expect(result.intentScope).toBe(0);
    expect(typeof result.timestampMs).toBe('bigint');
    expect(typeof result.registryId).toBe('string');
  });

  it('rejects expired or nearly expired attestations', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ...validResponse, expires_at: String(Date.now() + 10_000) }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      requestAttestation({ xUserId: '12345', suiAddress: '0x2' }),
    ).rejects.toThrow('Attestation already expired or expiring too soon');
  });

  it('rejects attestations with unexpected X user id', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ...validResponse, x_user_id: '54321' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      requestAttestation({ xUserId: '12345', suiAddress: '0x2' }),
    ).rejects.toThrow('Attestation response contained an unexpected X user id');
  });
});
