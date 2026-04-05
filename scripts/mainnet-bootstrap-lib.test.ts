import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertSuiEffectsSuccess,
  appendDeploymentHistory,
  classifyRegisterPubkeyDryRun,
  decideBootstrapActions,
  extractEnclaveRegistryPubkeys,
  extractContractsPublishResult,
  extractLevoUsdPublishResult,
  getSuiEffectsStatus,
  quoteEnvValue,
  sumGasMistBalance,
  upsertEnvFileContent,
} from './mainnet-bootstrap-lib.ts';

test('decideBootstrapActions skips chain work when current state is healthy', () => {
  assert.deepEqual(
    decideBootstrapActions({
      forceRedeploy: false,
      contractsValid: true,
      activeLevoValid: true,
      signerRegistered: true,
    }),
    {
      publishContracts: false,
      publishLevoUsd: false,
      onboardLevoUsd: false,
      addEntity: false,
      registerSigner: false,
    },
  );
});

test('decideBootstrapActions rebuilds settlement path when active levo state is invalid', () => {
  assert.deepEqual(
    decideBootstrapActions({
      forceRedeploy: false,
      contractsValid: true,
      activeLevoValid: false,
      signerRegistered: true,
    }),
    {
      publishContracts: false,
      publishLevoUsd: true,
      onboardLevoUsd: true,
      addEntity: true,
      registerSigner: false,
    },
  );
});

test('decideBootstrapActions rebuilds everything downstream when contracts are invalid', () => {
  assert.deepEqual(
    decideBootstrapActions({
      forceRedeploy: false,
      contractsValid: false,
      activeLevoValid: true,
      signerRegistered: true,
    }),
    {
      publishContracts: true,
      publishLevoUsd: true,
      onboardLevoUsd: true,
      addEntity: true,
      registerSigner: true,
    },
  );
});

test('decideBootstrapActions forces full redeploy when requested', () => {
  assert.deepEqual(
    decideBootstrapActions({
      forceRedeploy: true,
      contractsValid: true,
      activeLevoValid: true,
      signerRegistered: true,
    }),
    {
      publishContracts: true,
      publishLevoUsd: true,
      onboardLevoUsd: true,
      addEntity: true,
      registerSigner: true,
    },
  );
});

test('upsertEnvFileContent replaces existing keys and appends missing ones', () => {
  const input = [
    '# Database',
    'DATABASE_URL="postgres://db"',
    '',
    'NEXT_PUBLIC_PACKAGE_ID="0xold"',
    'NAUTILUS_SIGNER_SECRET=old-secret',
    '',
  ].join('\n');

  const output = upsertEnvFileContent(input, {
    NEXT_PUBLIC_PACKAGE_ID: '0xnew',
    ENCLAVE_REGISTRY_ID: '0xregistry',
    NAUTILUS_SIGNER_SECRET: 'new-secret',
  });

  assert.match(output, /DATABASE_URL="postgres:\/\/db"/);
  assert.match(output, /NEXT_PUBLIC_PACKAGE_ID="0xnew"/);
  assert.match(output, /NAUTILUS_SIGNER_SECRET="new-secret"/);
  assert.match(output, /ENCLAVE_REGISTRY_ID="0xregistry"/);
});

test('quoteEnvValue always produces a double-quoted env-safe value', () => {
  assert.equal(quoteEnvValue('plain'), '"plain"');
  assert.equal(quoteEnvValue('has "quotes"'), '"has \\"quotes\\""');
  assert.equal(quoteEnvValue('line1\nline2'), '"line1\\nline2"');
});

test('extractContractsPublishResult pulls publish ids from sui json', () => {
  const result = extractContractsPublishResult({
    effects: {
      transactionDigest: 'digest-1',
      status: {
        status: 'success',
      },
    },
    objectChanges: [
      {
        type: 'created',
        objectType: '0xabc::x_vault::XVaultRegistry',
        objectId: '0xvault',
      },
      {
        type: 'created',
        objectType: '0xabc::nautilus_verifier::EnclaveRegistry',
        objectId: '0xenclave',
      },
      {
        type: 'created',
        objectType: '0x2::package::UpgradeCap',
        objectId: '0xupgrade',
      },
      {
        type: 'published',
        packageId: '0xpackage',
      },
    ],
  });

  assert.deepEqual(result, {
    publishTxDigest: 'digest-1',
    packageId: '0xpackage',
    xVaultRegistryId: '0xvault',
    enclaveRegistryId: '0xenclave',
    upgradeCapId: '0xupgrade',
  });
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

test('extractEnclaveRegistryPubkeys decodes bcs vector contents from a shared object payload', () => {
  const registryId = new Array(32).fill(0x11);
  const admin = new Array(32).fill(0x22);
  const pubkeyA = new Array(32).fill(0xaa);
  const pubkeyB = new Array(32).fill(0xbb);
  const contents = [
    ...registryId,
    ...admin,
    0,
    2,
    32,
    ...pubkeyA,
    32,
    ...pubkeyB,
  ];

  assert.deepEqual(
    extractEnclaveRegistryPubkeys({
      data: {
        Move: {
          contents,
        },
      },
    }),
    [
      `0x${'aa'.repeat(32)}`,
      `0x${'bb'.repeat(32)}`,
    ],
  );
});

test('classifyRegisterPubkeyDryRun treats abort code 3 as already registered', () => {
  assert.equal(
    classifyRegisterPubkeyDryRun({
      effects: {
        status: {
          status: 'failure',
        },
        abortError: {
          module_id: '0xabc::nautilus_verifier',
          function: 'register_pubkey',
          error_code: 3,
        },
      },
    }),
    'already_registered',
  );
});

test('classifyRegisterPubkeyDryRun treats successful dry run as missing registration', () => {
  assert.equal(
    classifyRegisterPubkeyDryRun({
      effects: {
        status: {
          status: 'success',
        },
      },
    }),
    'missing',
  );
});

test('sumGasMistBalance adds all gas coins', () => {
  assert.equal(
    sumGasMistBalance([
      { gasCoinId: '0x1', mistBalance: 5 },
      { gasCoinId: '0x2', mistBalance: '7' },
      { gasCoinId: '0x3', mistBalance: 11n },
    ]),
    23n,
  );
});

test('appendDeploymentHistory archives previous live state without touching broken incidents', () => {
  const input = {
    network: 'mainnet',
    status: 'repair_complete',
    contracts: { packageId: '0xoldpkg', xVaultRegistryId: '0xoldvault' },
    stableLayer: {
      activeLevoUsd: { coinType: '0xold::levo_usd::LEVO_USD', factoryId: '0xfactory-old' },
      brokenLevoUsd: { coinType: '0xbroken::levo_usd::LEVO_USD' },
    },
    signer: { expectedPublicKey: '0xoldpub' },
  };

  const output = appendDeploymentHistory(input, {
    timestamp: '2026-04-04T12:00:00.000Z',
    reason: 'force_redeploy',
  });

  assert.equal(output.history.runs.length, 1);
  assert.equal(output.history.runs[0]?.timestamp, '2026-04-04T12:00:00.000Z');
  assert.equal(output.history.runs[0]?.reason, 'force_redeploy');
  assert.deepEqual(output.history.runs[0]?.previous?.contracts, input.contracts);
  assert.deepEqual(output.history.runs[0]?.previous?.stableLayer?.activeLevoUsd, input.stableLayer.activeLevoUsd);
  assert.deepEqual(output.history.runs[0]?.previous?.signer, input.signer);
  assert.deepEqual(output.stableLayer.brokenLevoUsd, input.stableLayer.brokenLevoUsd);
});
