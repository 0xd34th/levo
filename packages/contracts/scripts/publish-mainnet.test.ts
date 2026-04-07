import test from 'node:test';
import assert from 'node:assert/strict';

import { getContractsMainnetExcludedSources } from './publish-mainnet.ts';

test('contracts mainnet publish excludes only testnet-only sources', () => {
  assert.deepEqual(getContractsMainnetExcludedSources(), ['test_usdc.move']);
});
