import { describe, expect, it, vi } from 'vitest';
import { probePhantomCompanions } from './probePhantom';

const fakeSolana = (publicKey?: string, opts?: { isPhantom?: boolean }) => ({
  isPhantom: opts?.isPhantom ?? true,
  connect: vi.fn(async () => ({
    publicKey: { toString: () => publicKey ?? '' },
  })),
});

const fakeEvm = (
  accounts: string[] | Error,
  opts?: { isPhantom?: boolean },
) => ({
  isPhantom: opts?.isPhantom ?? true,
  request: vi.fn(async (_args: { method: string }) => {
    if (accounts instanceof Error) {
      throw accounts;
    }
    return accounts;
  }),
});

describe('probePhantomCompanions', () => {
  it('returns empty when window.phantom is missing', async () => {
    const result = await probePhantomCompanions({});
    expect(result).toEqual({});
  });

  it('reads Solana publicKey via onlyIfTrusted connect', async () => {
    const host = { phantom: { solana: fakeSolana('SoL1Address...') } };
    const result = await probePhantomCompanions(host);
    expect(result.solana).toBe('SoL1Address...');
    expect(host.phantom.solana.connect).toHaveBeenCalledWith({
      onlyIfTrusted: true,
    });
  });

  it('reads EVM address via eth_accounts', async () => {
    const host = { phantom: { ethereum: fakeEvm(['0xabc']) } };
    const result = await probePhantomCompanions(host);
    expect(result.evm).toBe('0xabc');
    expect(host.phantom.ethereum.request).toHaveBeenCalledWith({
      method: 'eth_accounts',
    });
  });

  it('returns undefined for a namespace whose probe throws', async () => {
    const host = {
      phantom: {
        solana: {
          isPhantom: true,
          connect: vi.fn(async () => {
            throw new Error('user rejected');
          }),
        },
        ethereum: fakeEvm(new Error('not authorized')),
      },
    };
    const result = await probePhantomCompanions(host);
    expect(result.solana).toBeUndefined();
    expect(result.evm).toBeUndefined();
  });

  it('skips namespaces missing the isPhantom flag', async () => {
    const host = {
      phantom: {
        solana: fakeSolana('SoL', { isPhantom: false }),
        ethereum: fakeEvm(['0xabc'], { isPhantom: false }),
      },
    };
    const result = await probePhantomCompanions(host);
    expect(result).toEqual({});
  });

  it('returns empty when eth_accounts is empty', async () => {
    const host = { phantom: { ethereum: fakeEvm([]) } };
    const result = await probePhantomCompanions(host);
    expect(result.evm).toBeUndefined();
  });
});
