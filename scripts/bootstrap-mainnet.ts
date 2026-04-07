import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  appendDeploymentHistory,
  buildLiveStableLayerState,
  decideBootstrapActions,
  extractEnclaveRegistryPubkeys,
  sumGasMistBalance,
  upsertEnvFileContent,
} from './mainnet-bootstrap-lib.ts';
import {
  createIsolatedSuiContext,
  extractJsonFromOutput,
  queryObjectExists,
  runCommand,
  runSuiClientJson,
} from './mainnet-bootstrap-runtime.ts';
import { publishContractsMainnet } from '../packages/contracts/scripts/publish-mainnet.ts';
import { publishLevoUsdMainnet } from '../packages/levo-usd/scripts/publish-mainnet.ts';
import { onboardLevoUsdMainnet } from '../packages/levo-usd/scripts/onboard-mainnet.ts';
import { addEntityMainnet } from '../packages/levo-usd/scripts/add-entity-mainnet.ts';
import { registerEnclavePubkeyMainnet } from '../packages/contracts/scripts/register-enclave-pubkey.ts';

const scriptPath = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(scriptPath), '..');
const WEB_ENV_PATH = path.join(ROOT, 'apps/web/.env');
const SIGNER_ENV_PATH = path.join(ROOT, 'apps/nautilus-signer/.env');
const DEPLOYMENT_STATE_PATH = path.join(ROOT, 'packages/contracts/deployed.mainnet.json');

const DEFAULT_MAX_SUPPLY_RAW = '1000000000000';
const CONTRACTS_GAS_BUDGET = '100000000';
const LEVO_USD_PUBLISH_GAS_BUDGET = '50000000';
const STABLE_LAYER_GAS_BUDGET = '50000000';
const REGISTER_GAS_BUDGET = '50000000';
const MIN_GAS_STATION_BALANCE_MIST = 100_000_000n;

type EnvMap = Record<string, string>;
type JsonRecord = Record<string, unknown>;

function printUsage() {
  console.log(
    [
      'Usage: pnpm bootstrap:mainnet -- --check|--confirm-mainnet [--force-redeploy] [--json]',
      '',
      'Requires:',
      '  SUI_DEPLOYER_PRIVATE_KEY=suiprivkey...',
      '  apps/web/.env with SUI_RPC_URL, GAS_STATION_SECRET_KEY, NAUTILUS_SIGNER_SECRET',
      '  apps/nautilus-signer/.env with NAUTILUS_SIGNER_SECRET, NAUTILUS_SIGNER_SEED_BASE64',
      '',
      'Modes:',
      '  --check            inspect current chain + config state without mutating files or chain',
      '  --confirm-mainnet  run the full bootstrap against mainnet',
      '  --force-redeploy   always republish contracts + standalone levo-usd and re-register signer',
      '  --json             emit machine-readable output',
    ].join('\n'),
  );
}

function parseArgs(argv: string[]) {
  const args = argv.filter((arg) => arg !== '--');
  const wantsHelp = args.includes('--help') || args.includes('-h');
  const checkOnly = args.includes('--check');
  const confirmMainnet = args.includes('--confirm-mainnet');
  const forceRedeploy = args.includes('--force-redeploy');
  const wantsJson = args.includes('--json');

  if (wantsHelp) {
    return { wantsHelp: true, checkOnly, confirmMainnet, forceRedeploy, wantsJson };
  }

  if (checkOnly === confirmMainnet) {
    throw new Error('Choose exactly one of --check or --confirm-mainnet');
  }

  return { wantsHelp: false, checkOnly, confirmMainnet, forceRedeploy, wantsJson };
}

function parseEnvFile(content: string): EnvMap {
  const env: EnvMap = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = /^([A-Z0-9_]+)=(.*)$/.exec(trimmed);
    if (!match?.[1]) {
      continue;
    }

    let value = match[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value.replaceAll('\\n', '\n').replaceAll('\\"', '"').replaceAll('\\\\', '\\');
  }

  return env;
}

function readEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing env file: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf8');
  return {
    content,
    values: parseEnvFile(content),
  };
}

function readDeploymentState(): JsonRecord {
  if (!existsSync(DEPLOYMENT_STATE_PATH)) {
    return {};
  }

  return JSON.parse(readFileSync(DEPLOYMENT_STATE_PATH, 'utf8')) as JsonRecord;
}

function writeFileAtomic(filePath: string, content: string) {
  const tempPath = `${filePath}.tmp`;
  writeFileSync(tempPath, content);
  renameSync(tempPath, filePath);
}

function required(env: EnvMap, key: string) {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required config: ${key}`);
  }
  return value;
}

function requireProcessEnv(key: string) {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getCoinPackageId(coinType: string | undefined) {
  if (!coinType || !coinType.includes('::')) {
    return '';
  }

  return coinType.split('::', 1)[0] ?? '';
}

function deriveKeyInfo(seedBase64: string, label: string) {
  const result = runCommand('pnpm', [
    'derive:key-info',
    '--',
    '--seed-base64',
    seedBase64,
    '--label',
    label,
    '--json',
  ], { cwd: ROOT });

  if (result.status !== 0) {
    throw new Error(`Failed to derive key info for ${label}`);
  }

  return extractJsonFromOutput(result.stdout) as {
    label: string;
    publicKeyHex: string;
    suiAddress: string;
  };
}

function getCurrentContractsState(deploymentState: JsonRecord, webEnv: EnvMap, signerEnv: EnvMap) {
  const contracts = (deploymentState.contracts ?? {}) as JsonRecord;
  return {
    publishTxDigest: typeof contracts.publishTxDigest === 'string' ? contracts.publishTxDigest : '',
    packageId: typeof contracts.packageId === 'string' ? contracts.packageId : (webEnv.NEXT_PUBLIC_PACKAGE_ID ?? ''),
    xVaultRegistryId: typeof contracts.xVaultRegistryId === 'string'
      ? contracts.xVaultRegistryId
      : (webEnv.NEXT_PUBLIC_VAULT_REGISTRY_ID ?? ''),
    enclaveRegistryId: typeof contracts.enclaveRegistryId === 'string'
      ? contracts.enclaveRegistryId
      : (webEnv.ENCLAVE_REGISTRY_ID ?? signerEnv.ENCLAVE_REGISTRY_ID ?? ''),
    upgradeCapId: typeof contracts.upgradeCapId === 'string' ? contracts.upgradeCapId : '',
  };
}

function getCurrentStableLayerState(deploymentState: JsonRecord, webEnv: EnvMap) {
  const stableLayer = (deploymentState.stableLayer ?? {}) as JsonRecord;
  const activeLevoUsd = (stableLayer.activeLevoUsd ?? {}) as JsonRecord;
  const coinType = typeof activeLevoUsd.coinType === 'string'
    ? activeLevoUsd.coinType
    : (webEnv.LEVO_USD_COIN_TYPE ?? '');

  return {
    packageId: typeof stableLayer.packageId === 'string'
      ? stableLayer.packageId
      : '0xa4a78d8d3d1df62fb81d10068142e79b0d30ad4e3f578060487e36ed9ea764da',
    registryId: typeof stableLayer.registryId === 'string'
      ? stableLayer.registryId
      : '0x213f4d584c0770f455bb98c94a4ee5ea9ddbc3d4ebb98a0ad6d093eb6da41642',
    mainnetUsdcType: typeof stableLayer.mainnetUsdcType === 'string'
      ? stableLayer.mainnetUsdcType
      : '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    activeLevoUsd: {
      status: typeof activeLevoUsd.status === 'string' ? activeLevoUsd.status : '',
      publishPackageId: typeof activeLevoUsd.publishPackageId === 'string'
        ? activeLevoUsd.publishPackageId
        : getCoinPackageId(coinType),
      treasuryCapId: typeof activeLevoUsd.treasuryCapId === 'string' ? activeLevoUsd.treasuryCapId : '',
      currencyId: typeof activeLevoUsd.currencyId === 'string' ? activeLevoUsd.currencyId : '',
      coinType,
      maxSupplyRaw: typeof activeLevoUsd.maxSupplyRaw === 'string'
        ? activeLevoUsd.maxSupplyRaw
        : DEFAULT_MAX_SUPPLY_RAW,
      publishTxDigest: typeof activeLevoUsd.publishTxDigest === 'string' ? activeLevoUsd.publishTxDigest : '',
      onboardingTxDigest: typeof activeLevoUsd.onboardingTxDigest === 'string' ? activeLevoUsd.onboardingTxDigest : '',
      entityType: typeof activeLevoUsd.entityType === 'string' ? activeLevoUsd.entityType : '',
      addEntityTxDigest: typeof activeLevoUsd.addEntityTxDigest === 'string' ? activeLevoUsd.addEntityTxDigest : '',
      factoryCapId: typeof activeLevoUsd.factoryCapId === 'string' ? activeLevoUsd.factoryCapId : '',
      factoryId: typeof activeLevoUsd.factoryId === 'string' ? activeLevoUsd.factoryId : '',
    },
  };
}

function validateBootstrapInputs(webEnv: EnvMap, signerEnv: EnvMap) {
  const network = webEnv.NEXT_PUBLIC_SUI_NETWORK?.trim();
  if (network && network !== 'mainnet') {
    throw new Error(`NEXT_PUBLIC_SUI_NETWORK must be mainnet, got ${network}`);
  }

  const webSignerSecret = required(webEnv, 'NAUTILUS_SIGNER_SECRET');
  const signerSecret = required(signerEnv, 'NAUTILUS_SIGNER_SECRET');
  if (webSignerSecret !== signerSecret) {
    throw new Error('NAUTILUS_SIGNER_SECRET must match between apps/web/.env and apps/nautilus-signer/.env');
  }

  return {
    rpcUrl: required(webEnv, 'SUI_RPC_URL'),
    gasStationSeed: required(webEnv, 'GAS_STATION_SECRET_KEY'),
    signerSeed: required(signerEnv, 'NAUTILUS_SIGNER_SEED_BASE64'),
  };
}

function getGasBalance(address: string, clientConfig: string) {
  const result = runCommand('sui', [
    'client',
    '--client.config',
    clientConfig,
    'gas',
    address,
    '--json',
  ]);
  if (result.status !== 0) {
    throw new Error(`Failed to query gas balance for ${address}`);
  }

  return sumGasMistBalance(extractJsonFromOutput(result.stdout) as Array<{ mistBalance: string | number | bigint }>);
}

function isContractsStateValid(state: ReturnType<typeof getCurrentContractsState>, clientConfig: string) {
  return Boolean(
    state.packageId
    && state.xVaultRegistryId
    && state.enclaveRegistryId
    && queryObjectExists(state.packageId, clientConfig)
    && queryObjectExists(state.xVaultRegistryId, clientConfig)
    && queryObjectExists(state.enclaveRegistryId, clientConfig),
  );
}

function isActiveLevoStateValid(state: ReturnType<typeof getCurrentStableLayerState>, clientConfig: string) {
  const active = state.activeLevoUsd;
  return Boolean(
    active.status
    && active.publishPackageId
    && active.publishTxDigest
    && active.coinType
    && active.onboardingTxDigest
    && active.entityType
    && active.addEntityTxDigest
    && active.factoryCapId
    && active.factoryId
    && active.coinType === `${active.publishPackageId}::levo_usd::LEVO_USD`
    && queryObjectExists(active.publishPackageId, clientConfig)
    && queryObjectExists(active.factoryCapId, clientConfig)
    && queryObjectExists(active.factoryId, clientConfig),
  );
}

function checkSignerRegistration(params: {
  enclaveRegistryId: string;
  signerPubkeyHex: string;
  clientConfig: string;
}) {
  if (!params.enclaveRegistryId) {
    return false;
  }
  const { json } = runSuiClientJson(['object', params.enclaveRegistryId], {
    clientConfig: params.clientConfig,
  });
  const normalizedTarget = params.signerPubkeyHex.toLowerCase();
  return extractEnclaveRegistryPubkeys(json).includes(normalizedTarget);
}

function buildNextDeploymentState(input: {
  existingState: JsonRecord;
  contracts: ReturnType<typeof getCurrentContractsState>;
  stableLayer: ReturnType<typeof getCurrentStableLayerState>;
  signer: { expectedPublicKey: string; registrationTxDigest: string };
  gasStation: { address: string };
  archivePrevious: boolean;
  archiveReason: string;
}) {
  const nowIso = new Date().toISOString();
  const baseState = input.archivePrevious
    ? appendDeploymentHistory(input.existingState, { timestamp: nowIso, reason: input.archiveReason }) as JsonRecord
    : structuredClone(input.existingState);

  const nextState = baseState as JsonRecord;
  nextState.network = 'mainnet';
  nextState.status = 'bootstrap_ready';
  nextState.contracts = input.contracts;
  nextState.stableLayer = buildLiveStableLayerState({
    packageId: input.stableLayer.packageId,
    registryId: input.stableLayer.registryId,
    mainnetUsdcType: input.stableLayer.mainnetUsdcType,
    activeLevoUsd: input.stableLayer.activeLevoUsd,
  });
  nextState.signer = input.signer;
  nextState.gasStation = input.gasStation;

  return nextState;
}

function summarizeActions(actions: ReturnType<typeof decideBootstrapActions>) {
  return Object.entries(actions)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.wantsHelp) {
    printUsage();
    process.exit(0);
  }

  const webEnvFile = readEnvFile(WEB_ENV_PATH);
  const signerEnvFile = readEnvFile(SIGNER_ENV_PATH);
  const deploymentState = readDeploymentState();
  const bootstrapInput = validateBootstrapInputs(webEnvFile.values, signerEnvFile.values);
  const deployerPrivateKey = requireProcessEnv('SUI_DEPLOYER_PRIVATE_KEY');

  const isolated = createIsolatedSuiContext({
    deployerPrivateKey,
    rpcUrl: bootstrapInput.rpcUrl,
  });

  try {
    const signerKeyInfo = deriveKeyInfo(bootstrapInput.signerSeed, 'nautilus-mainnet');
    const gasKeyInfo = deriveKeyInfo(bootstrapInput.gasStationSeed, 'gas-station-mainnet');
    const gasBalanceMist = getGasBalance(gasKeyInfo.suiAddress, isolated.clientConfig);
    if (gasBalanceMist === 0n) {
      throw new Error(`Gas station address ${gasKeyInfo.suiAddress} has zero SUI balance`);
    }

    const currentContracts = getCurrentContractsState(deploymentState, webEnvFile.values, signerEnvFile.values);
    const currentStableLayer = getCurrentStableLayerState(deploymentState, webEnvFile.values);
    const contractsValid = isContractsStateValid(currentContracts, isolated.clientConfig);
    const activeLevoValid = isActiveLevoStateValid(currentStableLayer, isolated.clientConfig);
    const signerRegistered = contractsValid
      ? checkSignerRegistration({
        enclaveRegistryId: currentContracts.enclaveRegistryId,
        signerPubkeyHex: signerKeyInfo.publicKeyHex,
        clientConfig: isolated.clientConfig,
      })
      : false;

    const actions = decideBootstrapActions({
      forceRedeploy: args.forceRedeploy,
      contractsValid,
      activeLevoValid,
      signerRegistered,
    });

    const summary = {
      mode: args.checkOnly ? 'check' : 'confirm_mainnet',
      forceRedeploy: args.forceRedeploy,
      deployerAddress: isolated.deployerAddress,
      signerPublicKey: signerKeyInfo.publicKeyHex,
      gasStationAddress: gasKeyInfo.suiAddress,
      gasStationBalanceMist: gasBalanceMist.toString(),
      gasStationBalanceSui: Number(gasBalanceMist) / 1_000_000_000,
      gasStationWarning: gasBalanceMist < MIN_GAS_STATION_BALANCE_MIST
        ? 'gas station balance is below 0.1 SUI'
        : null,
      currentState: {
        contractsValid,
        activeLevoValid,
        signerRegistered,
      },
      plannedActions: summarizeActions(actions),
    };

    if (args.checkOnly) {
      if (args.wantsJson) {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        console.log(
          [
            `Mode: ${summary.mode}`,
            `Deployer: ${summary.deployerAddress}`,
            `Signer public key: ${summary.signerPublicKey}`,
            `Gas station: ${summary.gasStationAddress}`,
            `Gas balance (mist): ${summary.gasStationBalanceMist}`,
            `Contracts valid: ${contractsValid}`,
            `Active LevoUSD valid: ${activeLevoValid}`,
            `Signer registered: ${signerRegistered}`,
            `Planned actions: ${summary.plannedActions.join(', ') || 'none'}`,
            ...(summary.gasStationWarning ? [`Warning: ${summary.gasStationWarning}`] : []),
          ].join('\n'),
        );
      }
      return;
    }

    let nextContracts = currentContracts;
    let nextStableLayer = currentStableLayer;
    let nextSigner = {
      expectedPublicKey: signerKeyInfo.publicKeyHex,
      registrationTxDigest: typeof (deploymentState.signer as JsonRecord | undefined)?.registrationTxDigest === 'string'
        ? String((deploymentState.signer as JsonRecord).registrationTxDigest)
        : '',
    };

    if (actions.publishContracts) {
      nextContracts = publishContractsMainnet({
        confirmMainnet: true,
        publishArgs: ['--gas-budget', CONTRACTS_GAS_BUDGET],
        sender: isolated.deployerAddress,
        clientConfig: isolated.clientConfig,
      });
    }

    if (actions.publishLevoUsd) {
      const publishResult = publishLevoUsdMainnet({
        confirmMainnet: true,
        publishArgs: ['--gas-budget', LEVO_USD_PUBLISH_GAS_BUDGET],
        sender: isolated.deployerAddress,
        clientConfig: isolated.clientConfig,
      });
      const onboardResult = onboardLevoUsdMainnet({
        treasuryCapId: publishResult.treasuryCapId,
        brandCoinType: publishResult.coinType,
        maxSupplyRaw: process.env.LEVO_USD_MAX_SUPPLY_RAW?.trim() || DEFAULT_MAX_SUPPLY_RAW,
        gasBudget: STABLE_LAYER_GAS_BUDGET,
        sender: isolated.deployerAddress,
        executeMainnet: true,
        confirmMainnet: true,
        clientConfig: isolated.clientConfig,
      });
      const addEntityResult = addEntityMainnet({
        factoryCapId: onboardResult.factoryCapId,
        brandCoinType: publishResult.coinType,
        gasBudget: STABLE_LAYER_GAS_BUDGET,
        sender: isolated.deployerAddress,
        executeMainnet: true,
        confirmMainnet: true,
        clientConfig: isolated.clientConfig,
      });

      nextStableLayer = {
        ...currentStableLayer,
        activeLevoUsd: {
          status: 'active',
          publishPackageId: publishResult.publishPackageId,
          treasuryCapId: publishResult.treasuryCapId,
          currencyId: publishResult.currencyId,
          coinType: publishResult.coinType,
          maxSupplyRaw: process.env.LEVO_USD_MAX_SUPPLY_RAW?.trim() || DEFAULT_MAX_SUPPLY_RAW,
          publishTxDigest: publishResult.publishTxDigest,
          onboardingTxDigest: onboardResult.onboardingTxDigest,
          entityType: '0xc1025fe014b03d33b207b5afb0ba04293be87fab438c1418a26a75c2fe05c223::stable_vault_farm::StableVaultFarmEntity<0xb75744fadcbfc174627567ca29645d0af8f6e6fd01b6f57c75a08cd3fb97c567::lake_usdc::LakeUSDC,0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC>',
          addEntityTxDigest: addEntityResult.addEntityTxDigest,
          factoryCapId: onboardResult.factoryCapId,
          factoryId: onboardResult.factoryId,
        },
      };
    }

    if (actions.registerSigner) {
      const registerResult = registerEnclavePubkeyMainnet({
        packageId: nextContracts.packageId,
        enclaveRegistryId: nextContracts.enclaveRegistryId,
        seedBase64: bootstrapInput.signerSeed,
        gasBudget: REGISTER_GAS_BUDGET,
        sender: isolated.deployerAddress,
        executeMainnet: true,
        confirmMainnet: true,
        clientConfig: isolated.clientConfig,
      });
      nextSigner = {
        expectedPublicKey: registerResult.pubkeyHex,
        registrationTxDigest: registerResult.registrationTxDigest,
      };
    }

    const updatedWebEnv = upsertEnvFileContent(webEnvFile.content, {
      NEXT_PUBLIC_SUI_NETWORK: 'mainnet',
      SUI_RPC_URL: bootstrapInput.rpcUrl,
      NEXT_PUBLIC_PACKAGE_ID: nextContracts.packageId,
      NEXT_PUBLIC_VAULT_REGISTRY_ID: nextContracts.xVaultRegistryId,
      LEVO_USD_COIN_TYPE: nextStableLayer.activeLevoUsd.coinType,
      ENCLAVE_REGISTRY_ID: nextContracts.enclaveRegistryId,
    });
    const updatedSignerEnv = upsertEnvFileContent(signerEnvFile.content, {
      ENCLAVE_REGISTRY_ID: nextContracts.enclaveRegistryId,
      NAUTILUS_SIGNER_EXPECTED_PUBLIC_KEY: signerKeyInfo.publicKeyHex,
    });

    const nextDeploymentState = buildNextDeploymentState({
      existingState: deploymentState,
      contracts: nextContracts,
      stableLayer: nextStableLayer,
      signer: nextSigner,
      gasStation: { address: gasKeyInfo.suiAddress },
      archivePrevious: args.forceRedeploy || actions.publishContracts || actions.publishLevoUsd,
      archiveReason: args.forceRedeploy ? 'force_redeploy' : 'bootstrap_replace',
    });

    writeFileAtomic(WEB_ENV_PATH, updatedWebEnv);
    writeFileAtomic(SIGNER_ENV_PATH, updatedSignerEnv);
    writeFileAtomic(DEPLOYMENT_STATE_PATH, `${JSON.stringify(nextDeploymentState, null, 2)}\n`);

    const finalSummary = {
      ...summary,
      contracts: nextContracts,
      activeLevoUsd: nextStableLayer.activeLevoUsd,
      signer: nextSigner,
    };

    if (args.wantsJson) {
      console.log(JSON.stringify(finalSummary, null, 2));
      return;
    }

    console.log(
      [
        'Mainnet bootstrap completed.',
        `Deployer: ${isolated.deployerAddress}`,
        `Contracts package: ${nextContracts.packageId}`,
        `XVaultRegistry: ${nextContracts.xVaultRegistryId}`,
        `EnclaveRegistry: ${nextContracts.enclaveRegistryId}`,
        `Active LevoUSD: ${nextStableLayer.activeLevoUsd.coinType}`,
        `Factory: ${nextStableLayer.activeLevoUsd.factoryId}`,
        `Signer pubkey: ${nextSigner.expectedPublicKey}`,
        `Gas station: ${gasKeyInfo.suiAddress}`,
        `Gas balance (mist): ${gasBalanceMist.toString()}`,
        ...(summary.gasStationWarning ? [`Warning: ${summary.gasStationWarning}`] : []),
      ].join('\n'),
    );
  } finally {
    isolated.cleanup();
  }
}

try {
  main();
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
