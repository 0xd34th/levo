import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetSealStateForTests,
  getSealClient,
  isSealConfigured,
} from './seal-client';

afterEach(() => {
  __resetSealStateForTests();
  vi.unstubAllEnvs();
});

describe('isSealConfigured', () => {
  it('returns false when neither env var is set', () => {
    vi.stubEnv('LEVO_AGENT_SEAL_OBJECT_ID', '');
    vi.stubEnv('LEVO_AGENT_SEAL_AGGREGATOR_URL', '');
    expect(isSealConfigured()).toBe(false);
  });

  it('returns false when only one env var is set', () => {
    vi.stubEnv('LEVO_AGENT_SEAL_OBJECT_ID', '0xseal');
    vi.stubEnv('LEVO_AGENT_SEAL_AGGREGATOR_URL', '');
    expect(isSealConfigured()).toBe(false);
  });

  it('returns true when both are set', () => {
    vi.stubEnv('LEVO_AGENT_SEAL_OBJECT_ID', '0xseal');
    vi.stubEnv('LEVO_AGENT_SEAL_AGGREGATOR_URL', 'https://example.test/seal');
    expect(isSealConfigured()).toBe(true);
  });
});

describe('getSealClient', () => {
  it('throws a clear error pointing at the docs page when env is missing', () => {
    vi.stubEnv('LEVO_AGENT_SEAL_OBJECT_ID', '');
    vi.stubEnv('LEVO_AGENT_SEAL_AGGREGATOR_URL', '');
    expect(() => getSealClient()).toThrow(/seal-docs.wal.app/);
  });
});
