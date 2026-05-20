import { afterEach, describe, expect, it, vi } from 'vitest';
import { toBase64 } from '@mysten/sui/utils';
import {
  __resetAgentKeypairForTests,
  getAgentAddress,
  getAgentKeypair,
  isAgentSignerConfigured,
  signPersonalMessageAsAgent,
  signTransactionAsAgent,
} from './kms';

function fakeSeed(byte: number): Uint8Array {
  const seed = new Uint8Array(32);
  seed.fill(byte);
  return seed;
}

afterEach(() => {
  __resetAgentKeypairForTests();
  vi.unstubAllEnvs();
});

describe('isAgentSignerConfigured', () => {
  it('returns false when env is missing', () => {
    vi.stubEnv('LEVO_AGENT_SIGNER_SECRET_KEY', '');
    expect(isAgentSignerConfigured()).toBe(false);
  });

  it('returns false for the replace-me placeholder', () => {
    vi.stubEnv('LEVO_AGENT_SIGNER_SECRET_KEY', 'replace-me');
    expect(isAgentSignerConfigured()).toBe(false);
  });

  it('returns true for any other non-empty value', () => {
    vi.stubEnv('LEVO_AGENT_SIGNER_SECRET_KEY', toBase64(fakeSeed(0x01)));
    expect(isAgentSignerConfigured()).toBe(true);
  });
});

describe('getAgentKeypair', () => {
  it('throws when env is unset', () => {
    vi.stubEnv('LEVO_AGENT_SIGNER_SECRET_KEY', '');
    expect(() => getAgentKeypair()).toThrow(/not configured/);
  });

  it('throws when env is the placeholder', () => {
    vi.stubEnv('LEVO_AGENT_SIGNER_SECRET_KEY', 'replace-me');
    expect(() => getAgentKeypair()).toThrow(/not configured/);
  });

  it('throws when the value is not valid base64', () => {
    vi.stubEnv('LEVO_AGENT_SIGNER_SECRET_KEY', '!!!not-base64!!!');
    expect(() => getAgentKeypair()).toThrow(/not valid base64|must decode to 32 bytes/);
  });

  it('throws when the decoded seed length is wrong', () => {
    const shortSeed = new Uint8Array(16);
    vi.stubEnv('LEVO_AGENT_SIGNER_SECRET_KEY', toBase64(shortSeed));
    expect(() => getAgentKeypair()).toThrow(/32 bytes/);
  });

  it('returns the same memoized keypair across calls with a valid seed', () => {
    vi.stubEnv('LEVO_AGENT_SIGNER_SECRET_KEY', toBase64(fakeSeed(0x42)));
    const first = getAgentKeypair();
    const second = getAgentKeypair();
    expect(first).toBe(second);
    expect(getAgentAddress()).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('two different seeds derive different addresses', () => {
    vi.stubEnv('LEVO_AGENT_SIGNER_SECRET_KEY', toBase64(fakeSeed(0x01)));
    const addr1 = getAgentAddress();
    __resetAgentKeypairForTests();
    vi.stubEnv('LEVO_AGENT_SIGNER_SECRET_KEY', toBase64(fakeSeed(0x02)));
    const addr2 = getAgentAddress();
    expect(addr1).not.toEqual(addr2);
  });
});

describe('signing helpers', () => {
  it('signTransactionAsAgent returns a serialized signature + bytes', async () => {
    vi.stubEnv('LEVO_AGENT_SIGNER_SECRET_KEY', toBase64(fakeSeed(0x10)));
    const txBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01]);
    const result = await signTransactionAsAgent(txBytes);
    expect(result.signature).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(result.bytes).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('signPersonalMessageAsAgent returns a serialized signature + bytes', async () => {
    vi.stubEnv('LEVO_AGENT_SIGNER_SECRET_KEY', toBase64(fakeSeed(0x20)));
    const result = await signPersonalMessageAsAgent(new TextEncoder().encode('test'));
    expect(result.signature).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(result.bytes).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});
