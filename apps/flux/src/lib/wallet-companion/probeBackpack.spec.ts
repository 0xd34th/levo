import { describe, expect, it, vi } from 'vitest';
import { probeBackpackCompanions } from './probeBackpack';

describe('probeBackpackCompanions', () => {
  it('returns empty when window.backpack is missing', async () => {
    const result = await probeBackpackCompanions({});
    expect(result).toEqual({});
  });

  it('reads Solana from synchronous publicKey when present', async () => {
    const host = {
      backpack: {
        solana: {
          isBackpack: true,
          publicKey: { toString: () => 'SoLBp' },
        },
      },
    };
    const result = await probeBackpackCompanions(host);
    expect(result.solana).toBe('SoLBp');
  });

  it('falls back to onlyIfTrusted connect when publicKey is missing', async () => {
    const connect = vi.fn(async () => ({
      publicKey: { toString: () => 'SoLBpConnect' },
    }));
    const host = {
      backpack: {
        solana: {
          isBackpack: true,
          connect,
        },
      },
    };
    const result = await probeBackpackCompanions(host);
    expect(result.solana).toBe('SoLBpConnect');
    expect(connect).toHaveBeenCalledWith({ onlyIfTrusted: true });
  });

  it('reads EVM via window.backpack.ethereum when present', async () => {
    const host = {
      backpack: {
        ethereum: {
          request: vi.fn(async () => ['0xbpevm']),
        },
      },
    };
    const result = await probeBackpackCompanions(host);
    expect(result.evm).toBe('0xbpevm');
  });

  it('falls back to window.ethereum only when isBackpack is true', async () => {
    const requestTrue = vi.fn(async () => ['0xfromBackpack']);
    const hostTrue = {
      backpack: {},
      ethereum: { isBackpack: true, request: requestTrue },
    };
    expect((await probeBackpackCompanions(hostTrue)).evm).toBe(
      '0xfromBackpack',
    );

    const requestFalse = vi.fn(async () => ['0xfromMM']);
    const hostFalse = {
      backpack: {},
      ethereum: { isBackpack: false, request: requestFalse },
    };
    expect((await probeBackpackCompanions(hostFalse)).evm).toBeUndefined();
    expect(requestFalse).not.toHaveBeenCalled();
  });

  it('returns undefined when probes throw', async () => {
    const host = {
      backpack: {
        solana: {
          isBackpack: true,
          connect: vi.fn(async () => {
            throw new Error('not trusted');
          }),
        },
        ethereum: {
          request: vi.fn(async () => {
            throw new Error('not authorized');
          }),
        },
      },
    };
    const result = await probeBackpackCompanions(host);
    expect(result).toEqual({});
  });
});
