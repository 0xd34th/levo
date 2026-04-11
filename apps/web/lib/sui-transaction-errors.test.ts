import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getGasStationAddressMock } = vi.hoisted(() => ({
  getGasStationAddressMock: vi.fn(),
}));

vi.mock('@/lib/gas-station', () => ({
  getGasStationAddress: getGasStationAddressMock,
}));

import {
  annotateNoValidGasCoinsError,
  getAnnotatedTransactionErrorMessage,
} from './sui-transaction-errors';

describe('annotateNoValidGasCoinsError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGasStationAddressMock.mockReturnValue('0xgasstation');
  });

  it('adds the gas station address and recovery commands to gas coin errors', () => {
    expect(annotateNoValidGasCoinsError('No valid gas coins found for the transaction.')).toBe(
      'No valid gas coins found for the transaction. Gas station address: 0xgasstation. Check sponsor SUI balance/fragmentation with "pnpm --dir apps/web gas-station:status"; if needed, merge coins with "pnpm --dir apps/web gas-station:merge".',
    );
  });

  it('returns non-gas errors unchanged', () => {
    expect(annotateNoValidGasCoinsError('RPC timeout')).toBe('RPC timeout');
  });

  it('keeps the recovery hint usable when the gas station address is unavailable', () => {
    getGasStationAddressMock.mockReturnValue(null);

    expect(annotateNoValidGasCoinsError('No valid gas coins found for the transaction.')).toBe(
      'No valid gas coins found for the transaction. Gas station address: unavailable. Check sponsor SUI balance/fragmentation with "pnpm --dir apps/web gas-station:status"; if needed, merge coins with "pnpm --dir apps/web gas-station:merge".',
    );
  });
});

describe('getAnnotatedTransactionErrorMessage', () => {
  it('extracts the enhanced error message from Error instances', () => {
    getGasStationAddressMock.mockReturnValue('0xgasstation');

    expect(
      getAnnotatedTransactionErrorMessage(
        new Error('No valid gas coins found for the transaction.'),
      ),
    ).toBe(
      'No valid gas coins found for the transaction. Gas station address: 0xgasstation. Check sponsor SUI balance/fragmentation with "pnpm --dir apps/web gas-station:status"; if needed, merge coins with "pnpm --dir apps/web gas-station:merge".',
    );
  });
});
