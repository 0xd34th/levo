import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSignerServer } from './server';
import { loadConfig } from './config';
import { signAttestation } from './sign-attestation';

const env = {
  HOST: '127.0.0.1',
  PORT: '8787',
  ENCLAVE_REGISTRY_ID: '0x11cddaae036a2faabc315226ae031d10cd1c488f91dd436fd0aac2157b25715a',
  NAUTILUS_SIGNER_EXPECTED_PUBLIC_KEY:
    '0xf98637627e7555b3f40603113378f965788f7f26dca1e5e8505f17e4eacf9c32',
  NAUTILUS_SIGNER_SECRET: '12345678901234567890123456789012',
  NAUTILUS_SIGNER_SEED_BASE64: 'G535YBKX0pkKt4fWrlYAijgdw/R840hgdxPLX5R0WSA=',
} as const;

describe('nautilus signer HTTP server', () => {
  let server: Awaited<ReturnType<typeof createSignerServer>>;
  let baseUrl: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T00:00:00.000Z'));

    server = await createSignerServer({
      config: loadConfig(env),
    });
    const address = await server.listen();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await server.close();
    vi.useRealTimers();
  });

  it('returns a signed attestation for a valid request', async () => {
    const response = await fetch(`${baseUrl}/attestation`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.NAUTILUS_SIGNER_SECRET}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        x_user_id: '12345',
        sui_address: '0x2',
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      signAttestation(
        loadConfig(env),
        {
          xUserId: '12345',
          suiAddress: '0x2',
        },
        { nowMs: Date.now() },
      ),
    );
  });

  it('rejects missing auth', async () => {
    const response = await fetch(`${baseUrl}/attestation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        x_user_id: '12345',
        sui_address: '0x2',
      }),
    });

    expect(response.status).toBe(401);
  });

  it('rejects bad auth', async () => {
    const response = await fetch(`${baseUrl}/attestation`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer nope',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        x_user_id: '12345',
        sui_address: '0x2',
      }),
    });

    expect(response.status).toBe(403);
  });

  it('rejects invalid methods', async () => {
    const response = await fetch(`${baseUrl}/attestation`, {
      method: 'GET',
    });

    expect(response.status).toBe(405);
  });

  it('rejects invalid x_user_id', async () => {
    const response = await fetch(`${baseUrl}/attestation`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.NAUTILUS_SIGNER_SECRET}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        x_user_id: '12abc',
        sui_address: '0x2',
      }),
    });

    expect(response.status).toBe(400);
  });

  it('rejects invalid sui_address', async () => {
    const response = await fetch(`${baseUrl}/attestation`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.NAUTILUS_SIGNER_SECRET}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        x_user_id: '12345',
        sui_address: '0xnot-an-address',
      }),
    });

    expect(response.status).toBe(400);
  });

  it('rejects empty request bodies as invalid input', async () => {
    const response = await fetch(`${baseUrl}/attestation`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.NAUTILUS_SIGNER_SECRET}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
  });

  it('rejects wrong-typed request fields as invalid input', async () => {
    const response = await fetch(`${baseUrl}/attestation`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.NAUTILUS_SIGNER_SECRET}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        x_user_id: '12345',
        sui_address: 123,
      }),
    });

    expect(response.status).toBe(400);
  });

  it('rejects malformed JSON bodies', async () => {
    const response = await fetch(`${baseUrl}/attestation`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.NAUTILUS_SIGNER_SECRET}`,
        'content-type': 'application/json',
      },
      body: '{',
    });

    expect(response.status).toBe(400);
  });
});
