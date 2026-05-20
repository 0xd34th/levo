import {
  assertCommandSucceeded,
  ensureActiveMainnet,
  extractJsonFromOutput,
  formatCommand,
  normalizeHex,
  runCommand,
  shellQuote,
} from '../../../scripts/mainnet-bootstrap-runtime.ts';
import { assertSuiEffectsSuccess } from '../../../scripts/mainnet-bootstrap-lib.ts';

const DEFAULT_STABLE_LAYER_PACKAGE_ID =
  '0xa4a78d8d3d1df62fb81d10068142e79b0d30ad4e3f578060487e36ed9ea764da';
const DEFAULT_STABLE_REGISTRY_ID =
  '0x213f4d584c0770f455bb98c94a4ee5ea9ddbc3d4ebb98a0ad6d093eb6da41642';
const DEFAULT_USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

export interface OnboardLevoUsdMainnetOptions {
  stableLayerPackageId?: string;
  stableRegistryId?: string;
  quoteCoinType?: string;
  treasuryCapId: string;
  brandCoinType: string;
  maxSupplyRaw: string;
  gasBudget?: string;
  sender?: string;
  dryRun?: boolean;
  executeMainnet?: boolean;
  confirmMainnet?: boolean;
  clientConfig?: string;
}

function printUsage() {
  console.log(
    [
      'Usage: pnpm onboard:levo-usd:mainnet -- --treasury-cap-id <id> --brand-coin-type <type> --max-supply-raw <u64> [options]',
      '',
      'Builds a PTB for StableLayer onboarding with the corrected type arguments:',
      '  stable_layer::new<BrandCoin, USDC>',
      'Follow this with entity activation:',
      '  stable_layer::add_entity<BrandCoin, USDC, StableVaultFarmEntity<...>>',
      '',
      'Default mode prints the exact `sui client ptb` command.',
      'Use --dry-run to execute a mainnet dry-run.',
      'Use --execute-mainnet together with --confirm-mainnet for the real onboarding transaction.',
      '',
      'Options:',
      `  --stable-layer-package-id <id>   default ${DEFAULT_STABLE_LAYER_PACKAGE_ID}`,
      `  --stable-registry-id <id>        default ${DEFAULT_STABLE_REGISTRY_ID}`,
      `  --quote-coin-type <type>         default ${DEFAULT_USDC_TYPE}`,
      '  --treasury-cap-id <id>           required',
      '  --brand-coin-type <type>         required',
      '  --max-supply-raw <u64>           required',
      '  --gas-budget <mist>              default 50000000',
      '  --sender <address>               optional explicit sender override',
      '  --dry-run',
      '  --execute-mainnet --confirm-mainnet',
      '  --json',
    ].join('\n'),
  );
}

function parseFactoryResult(payload: unknown, brandCoinType: string, quoteCoinType: string) {
  const root = payload as Record<string, unknown>;
  const effects = (root.effects ?? {}) as Record<string, unknown>;
  const objectChanges = Array.isArray(root.objectChanges) ? root.objectChanges as Array<Record<string, unknown>> : [];
  const typeSuffix = `<${brandCoinType},${quoteCoinType}>`;
  const factoryCap = objectChanges.find((change) =>
    change.type === 'created'
    && typeof change.objectType === 'string'
    && change.objectType.includes(`::stable_layer::FactoryCap${typeSuffix}`),
  );
  const factory = objectChanges.find((change) =>
    change.type === 'created'
    && typeof change.objectType === 'string'
    && change.objectType.includes(`::stable_layer::StableFactory${typeSuffix}`),
  );

  return {
    onboardingTxDigest: String(effects.transactionDigest ?? ''),
    factoryCapId: String(factoryCap?.objectId ?? ''),
    factoryId: String(factory?.objectId ?? ''),
  };
}

function buildPreviewCommand(options: Required<Pick<OnboardLevoUsdMainnetOptions, 'stableLayerPackageId' | 'stableRegistryId' | 'quoteCoinType' | 'treasuryCapId' | 'brandCoinType' | 'maxSupplyRaw' | 'gasBudget'>> & Pick<OnboardLevoUsdMainnetOptions, 'sender'>) {
  const typeArgs = `<${options.brandCoinType},${options.quoteCoinType}>`;
  const args = [
    'client',
    'ptb',
    '--move-call',
    'sui::tx_context::sender',
    '--assign',
    'tx_sender',
    '--move-call',
    `${options.stableLayerPackageId}::stable_layer::new`,
    typeArgs,
    `@${options.stableRegistryId}`,
    `@${options.treasuryCapId}`,
    options.maxSupplyRaw,
    '--assign',
    'factory_cap',
    '--transfer-objects',
    '[factory_cap]',
    'tx_sender',
    '--gas-budget',
    options.gasBudget,
  ];

  if (options.sender) {
    args.push('--sender', `@${normalizeHex(options.sender, 'sender address')}`);
  }

  return `sui ${args.map(shellQuote).join(' ')}`;
}

export function onboardLevoUsdMainnet(input: OnboardLevoUsdMainnetOptions) {
  const options = {
    stableLayerPackageId: input.stableLayerPackageId ?? DEFAULT_STABLE_LAYER_PACKAGE_ID,
    stableRegistryId: input.stableRegistryId ?? DEFAULT_STABLE_REGISTRY_ID,
    quoteCoinType: input.quoteCoinType ?? DEFAULT_USDC_TYPE,
    treasuryCapId: input.treasuryCapId,
    brandCoinType: input.brandCoinType,
    maxSupplyRaw: input.maxSupplyRaw,
    gasBudget: input.gasBudget ?? '50000000',
    sender: input.sender,
    dryRun: input.dryRun ?? false,
    executeMainnet: input.executeMainnet ?? false,
    confirmMainnet: input.confirmMainnet ?? false,
    clientConfig: input.clientConfig,
  };

  if (!options.treasuryCapId) {
    throw new Error('Missing --treasury-cap-id');
  }
  if (!options.brandCoinType) {
    throw new Error('Missing --brand-coin-type');
  }
  if (!options.maxSupplyRaw || !/^\d+$/.test(options.maxSupplyRaw)) {
    throw new Error('Invalid --max-supply-raw: expected an unsigned integer string');
  }
  if (options.executeMainnet && !options.confirmMainnet) {
    throw new Error('Refusing to execute without --confirm-mainnet');
  }
  if (options.executeMainnet && options.dryRun) {
    throw new Error('Choose either --dry-run or --execute-mainnet, not both');
  }

  const stableLayerPackageId = normalizeHex(options.stableLayerPackageId, 'stable layer package id');
  const stableRegistryId = normalizeHex(options.stableRegistryId, 'stable registry id');
  const treasuryCapId = normalizeHex(options.treasuryCapId, 'treasury cap id');

  const previewCommand = buildPreviewCommand({
    stableLayerPackageId,
    stableRegistryId,
    quoteCoinType: options.quoteCoinType,
    treasuryCapId,
    brandCoinType: options.brandCoinType,
    maxSupplyRaw: options.maxSupplyRaw,
    gasBudget: options.gasBudget,
    sender: options.sender,
  });

  if (!options.dryRun && !options.executeMainnet) {
    return {
      stableLayerPackageId,
      stableRegistryId,
      quoteCoinType: options.quoteCoinType,
      treasuryCapId,
      brandCoinType: options.brandCoinType,
      maxSupplyRaw: options.maxSupplyRaw,
      suggestedDryRun: `${previewCommand} --dry-run --json`,
      suggestedExecution: `${previewCommand} --json`,
    };
  }

  ensureActiveMainnet(options.clientConfig);

  const typeArgs = `<${options.brandCoinType},${options.quoteCoinType}>`;
  const commandArgs = options.clientConfig
    ? ['client', '--client.config', options.clientConfig, 'ptb']
    : ['client', 'ptb'];
  commandArgs.push(
    '--move-call',
    'sui::tx_context::sender',
    '--assign',
    'tx_sender',
    '--move-call',
    `${stableLayerPackageId}::stable_layer::new`,
    typeArgs,
    `@${stableRegistryId}`,
    `@${treasuryCapId}`,
    options.maxSupplyRaw,
    '--assign',
    'factory_cap',
    '--transfer-objects',
    '[factory_cap]',
    'tx_sender',
    '--gas-budget',
    options.gasBudget,
  );

  if (options.sender) {
    commandArgs.push('--sender', `@${normalizeHex(options.sender, 'sender address')}`);
  }

  if (options.dryRun) {
    commandArgs.push('--dry-run');
  }
  commandArgs.push('--json');

  const result = runCommand('sui', commandArgs);
  assertCommandSucceeded(result, 'Running StableLayer onboarding', formatCommand('sui', commandArgs));
  const payload = extractJsonFromOutput(result.stdout);
  assertSuiEffectsSuccess(payload, 'StableLayer onboarding');
  return {
    stableLayerPackageId,
    stableRegistryId,
    quoteCoinType: options.quoteCoinType,
    treasuryCapId,
    brandCoinType: options.brandCoinType,
    maxSupplyRaw: options.maxSupplyRaw,
    ...parseFactoryResult(payload, options.brandCoinType, options.quoteCoinType),
  };
}

function parseCliArgs(argv: string[]) {
  const args = argv.filter((arg) => arg !== '--');
  const options: Record<string, string | boolean | undefined> = {
    dryRun: false,
    executeMainnet: false,
    confirmMainnet: false,
    wantsJson: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      return { wantsHelp: true };
    }
    if (arg === '--stable-layer-package-id') options.stableLayerPackageId = args[++index];
    else if (arg === '--stable-registry-id') options.stableRegistryId = args[++index];
    else if (arg === '--quote-coin-type') options.quoteCoinType = args[++index];
    else if (arg === '--treasury-cap-id') options.treasuryCapId = args[++index];
    else if (arg === '--brand-coin-type') options.brandCoinType = args[++index];
    else if (arg === '--max-supply-raw') options.maxSupplyRaw = args[++index];
    else if (arg === '--gas-budget') options.gasBudget = args[++index];
    else if (arg === '--sender') options.sender = args[++index];
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--execute-mainnet') options.executeMainnet = true;
    else if (arg === '--confirm-mainnet') options.confirmMainnet = true;
    else if (arg === '--json') options.wantsJson = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return { wantsHelp: false, ...options };
}

function main() {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.wantsHelp) {
    printUsage();
    process.exit(0);
  }

  try {
    const result = onboardLevoUsdMainnet({
      stableLayerPackageId: parsed.stableLayerPackageId as string | undefined,
      stableRegistryId: parsed.stableRegistryId as string | undefined,
      quoteCoinType: parsed.quoteCoinType as string | undefined,
      treasuryCapId: parsed.treasuryCapId as string,
      brandCoinType: parsed.brandCoinType as string,
      maxSupplyRaw: parsed.maxSupplyRaw as string,
      gasBudget: parsed.gasBudget as string | undefined,
      sender: parsed.sender as string | undefined,
      dryRun: Boolean(parsed.dryRun),
      executeMainnet: Boolean(parsed.executeMainnet),
      confirmMainnet: Boolean(parsed.confirmMainnet),
    });

    if (parsed.wantsJson) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if ('suggestedDryRun' in result) {
      console.log(
        [
          `StableLayer package ID: ${result.stableLayerPackageId}`,
          `Stable registry ID: ${result.stableRegistryId}`,
          `Brand coin type: ${result.brandCoinType}`,
          `Quote coin type: ${result.quoteCoinType}`,
          `TreasuryCap: ${result.treasuryCapId}`,
          `Max supply raw: ${result.maxSupplyRaw}`,
          `Dry-run: ${result.suggestedDryRun}`,
          `Execute: ${result.suggestedExecution}`,
        ].join('\n'),
      );
      return;
    }

    console.log(
      [
        'StableLayer onboarding completed.',
        `FactoryCap: ${result.factoryCapId}`,
        `StableFactory: ${result.factoryId}`,
        `Tx digest: ${result.onboardingTxDigest}`,
      ].join('\n'),
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
