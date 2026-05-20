import { describe, expect, it, vi } from 'vitest';
import { probeOkxCompanions } from './probeOkx';

describe('probeOkxCompanions', () => {
  it('returns empty when window.okxwallet is missing', async () => {
    const result = await probeOkxCompanions({});
    expect(result).toEqual({});
  });

  it('reads Solana publicKey synchronously, EVM via eth_accounts, BTC via getAccounts', async () => {
    const host = {
      okxwallet: {
        request: vi.fn(async () => ['0xokxevm']),
        solana: { publicKey: { toString: () => 'SoLOkx' } },
        bitcoin: {
          getAccounts: vi.fn(async () => ['bc1qabc']),
        },
      },
    };
    const result = await probeOkxCompanions(host);
    expect(result).toEqual({
      solana: 'SoLOkx',
      evm: '0xokxevm',
      bitcoin: 'bc1qabc',
    });
  });

  it('returns no Solana when publicKey is null', async () => {
    const host = {
      okxwallet: {
        solana: { publicKey: null },
      },
    };
    const result = await probeOkxCompanions(host);
    expect(result.solana).toBeUndefined();
  });

  it('returns undefined for namespaces that throw', async () => {
    const host = {
      okxwallet: {
        request: vi.fn(async () => {
          throw new Error('not authorized');
        }),
        bitcoin: {
          getAccounts: vi.fn(async () => {
            throw new Error('not supported');
          }),
        },
      },
    };
    const result = await probeOkxCompanions(host);
    expect(result.evm).toBeUndefined();
    expect(result.bitcoin).toBeUndefined();
  });

  it('returns empty arrays as undefined', async () => {
    const host = {
      okxwallet: {
        request: vi.fn(async () => [] as string[]),
        bitcoin: {
          getAccounts: vi.fn(async () => [] as string[]),
        },
      },
    };
    const result = await probeOkxCompanions(host);
    expect(result.evm).toBeUndefined();
    expect(result.bitcoin).toBeUndefined();
  });
});
