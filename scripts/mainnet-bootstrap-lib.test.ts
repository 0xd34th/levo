import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertSuiEffectsSuccess,
  extractLevoUsdPublishResult,
  getSuiEffectsStatus,
} from './mainnet-bootstrap-lib.ts';

test('getSuiEffectsStatus reads success and failure payloads', () => {
  assert.deepEqual(
    getSuiEffectsStatus({
      effects: {
        status: {
          status: 'success',
        },
      },
    }),
    { status: 'success', error: '' },
  );

  assert.deepEqual(
    getSuiEffectsStatus({
      effects: {
        status: {
          status: 'failure',
          error: 'boom',
        },
      },
    }),
    { status: 'failure', error: 'boom' },
  );
});

test('assertSuiEffectsSuccess throws when effects status is failure', () => {
  assert.throws(
    () => assertSuiEffectsSuccess({
      effects: {
        status: {
          status: 'failure',
          error: 'abort',
        },
      },
    }, 'demo'),
    /demo failed on-chain: abort/,
  );
});

test('extractLevoUsdPublishResult derives coin type and treasury ids', () => {
  const result = extractLevoUsdPublishResult({
    effects: {
      transactionDigest: 'digest-2',
      status: {
        status: 'success',
      },
    },
    objectChanges: [
      {
        type: 'published',
        packageId: '0xcoinpkg',
      },
      {
        type: 'created',
        objectType: '0x2::coin::TreasuryCap<0xcoinpkg::levo_usd::LEVO_USD>',
        objectId: '0xtreasury',
      },
      {
        type: 'created',
        objectType: '0x2::coin_registry::Currency<0xcoinpkg::levo_usd::LEVO_USD>',
        objectId: '0xcurrency',
      },
    ],
  });

  assert.deepEqual(result, {
    publishTxDigest: 'digest-2',
    publishPackageId: '0xcoinpkg',
    treasuryCapId: '0xtreasury',
    currencyId: '0xcurrency',
    coinType: '0xcoinpkg::levo_usd::LEVO_USD',
  });
});
