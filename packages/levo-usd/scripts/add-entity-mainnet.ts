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
const DEFAULT_FARM_ENTITY_TYPE =
  '0xc1025fe014b03d33b207b5afb0ba04293be87fab438c1418a26a75c2fe05c223::stable_vault_farm::StableVaultFarmEntity<0xb75744fadcbfc174627567ca29645d0af8f6e6fd01b6f57c75a08cd3fb97c567::lake_usdc::LakeUSDC,0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC>';

export interface AddEntityMainnetOptions {
  stableLayerPackageId?: string;
  stableRegistryId?: string;
  quoteCoinType?: string;
  entityType?: string;
  factoryCapId: string;
  brandCoinType: string;
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
      'Usage: pnpm add-entity:levo-usd:mainnet -- --factory-cap-id <id> --brand-coin-type <type> [options]',
      '',
      'Builds a PTB for StableLayer entity activation after onboarding:',
      '  stable_layer::add_entity<BrandCoin, USDC, StableVaultFarmEntity<...>>',
      '',
      'Default mode prints the exact `sui client ptb` commands.',
      'Use --dry-run to execute a mainnet dry-run.',
      'Use --execute-mainnet together with --confirm-mainnet for the real activation transaction.',
      '',
      'Options:',
      `  --stable-layer-package-id <id>   default ${DEFAULT_STABLE_LAYER_PACKAGE_ID}`,
      `  --stable-registry-id <id>        default ${DEFAULT_STABLE_REGISTRY_ID}`,
      `  --quote-coin-type <type>         default ${DEFAULT_USDC_TYPE}`,
      `  --entity-type <type>             default ${DEFAULT_FARM_ENTITY_TYPE}`,
      '  --factory-cap-id <id>            required',
      '  --brand-coin-type <type>         required',
      '  --gas-budget <mist>              default 50000000',
      '  --sender <address>               optional explicit sender override',
      '  --dry-run',
      '  --execute-mainnet --confirm-mainnet',
      '  --json',
    ].join('\n'),
  );
}

function buildPreviewCommand(options: Required<Pick<AddEntityMainnetOptions, 'stableLayerPackageId' | 'stableRegistryId' | 'quoteCoinType' | 'entityType' | 'factoryCapId' | 'brandCoinType' | 'gasBudget'>> & Pick<AddEntityMainnetOptions, 'sender'>) {
  const typeArgs = `<${options.brandCoinType},${options.quoteCoinType},${options.entityType}>`;
  const args = [
    'client',
    'ptb',
    '--move-call',
    `${options.stableLayerPackageId}::stable_layer::add_entity`,
    typeArgs,
    `@${options.stableRegistryId}`,
    `@${options.factoryCapId}`,
    '--gas-budget',
    options.gasBudget,
  ];

  if (options.sender) {
    args.push('--sender', normalizeHex(options.sender, 'sender address'));
  }

  return `sui ${args.map(shellQuote).join(' ')}`;
}

export function addEntityMainnet(input: AddEntityMainnetOptions) {
  const options = {
    stableLayerPackageId: input.stableLayerPackageId ?? DEFAULT_STABLE_LAYER_PACKAGE_ID,
    stableRegistryId: input.stableRegistryId ?? DEFAULT_STABLE_REGISTRY_ID,
    quoteCoinType: input.quoteCoinType ?? DEFAULT_USDC_TYPE,
    entityType: input.entityType ?? DEFAULT_FARM_ENTITY_TYPE,
    factoryCapId: input.factoryCapId,
    brandCoinType: input.brandCoinType,
    gasBudget: input.gasBudget ?? '50000000',
    sender: input.sender,
    dryRun: input.dryRun ?? false,
    executeMainnet: input.executeMainnet ?? false,
    confirmMainnet: input.confirmMainnet ?? false,
    clientConfig: input.clientConfig,
  };

  if (!options.factoryCapId) {
    throw new Error('Missing --factory-cap-id');
  }
  if (!options.brandCoinType) {
    throw new Error('Missing --brand-coin-type');
  }
  if (options.executeMainnet && !options.confirmMainnet) {
    throw new Error('Refusing to execute without --confirm-mainnet');
  }
  if (options.executeMainnet && options.dryRun) {
    throw new Error('Choose either --dry-run or --execute-mainnet, not both');
  }

  const stableLayerPackageId = normalizeHex(options.stableLayerPackageId, 'stable layer package id');
  const stableRegistryId = normalizeHex(options.stableRegistryId, 'stable registry id');
  const factoryCapId = normalizeHex(options.factoryCapId, 'factory cap id');
  const previewCommand = buildPreviewCommand({
    stableLayerPackageId,
    stableRegistryId,
    quoteCoinType: options.quoteCoinType,
    entityType: options.entityType,
    factoryCapId,
    brandCoinType: options.brandCoinType,
    gasBudget: options.gasBudget,
    sender: options.sender,
  });

  if (!options.dryRun && !options.executeMainnet) {
    return {
      stableLayerPackageId,
      stableRegistryId,
      quoteCoinType: options.quoteCoinType,
      entityType: options.entityType,
      factoryCapId,
      brandCoinType: options.brandCoinType,
      suggestedDryRun: `${previewCommand} --dry-run --json`,
      suggestedExecution: `${previewCommand} --json`,
    };
  }

  ensureActiveMainnet(options.clientConfig);

  const typeArgs = `<${options.brandCoinType},${options.quoteCoinType},${options.entityType}>`;
  const commandArgs = options.clientConfig
    ? ['client', '--client.config', options.clientConfig, 'ptb']
    : ['client', 'ptb'];
  commandArgs.push(
    '--move-call',
    `${stableLayerPackageId}::stable_layer::add_entity`,
    typeArgs,
    `@${stableRegistryId}`,
    `@${factoryCapId}`,
    '--gas-budget',
    options.gasBudget,
  );

  if (options.sender) {
    commandArgs.push('--sender', normalizeHex(options.sender, 'sender address'));
  }
  if (options.dryRun) {
    commandArgs.push('--dry-run');
  }
  commandArgs.push('--json');

  const result = runCommand('sui', commandArgs);
  assertCommandSucceeded(result, 'Running StableLayer add_entity', formatCommand('sui', commandArgs));
  const payload = extractJsonFromOutput(result.stdout) as Record<string, unknown>;
  assertSuiEffectsSuccess(payload, 'StableLayer add_entity');
  const effects = (payload.effects ?? {}) as Record<string, unknown>;

  return {
    stableLayerPackageId,
    stableRegistryId,
    quoteCoinType: options.quoteCoinType,
    entityType: options.entityType,
    factoryCapId,
    brandCoinType: options.brandCoinType,
    addEntityTxDigest: String(effects.transactionDigest ?? ''),
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
    if (arg === '--help' || arg === '-h') return { wantsHelp: true };
    if (arg === '--stable-layer-package-id') options.stableLayerPackageId = args[++index];
    else if (arg === '--stable-registry-id') options.stableRegistryId = args[++index];
    else if (arg === '--quote-coin-type') options.quoteCoinType = args[++index];
    else if (arg === '--entity-type') options.entityType = args[++index];
    else if (arg === '--factory-cap-id') options.factoryCapId = args[++index];
    else if (arg === '--brand-coin-type') options.brandCoinType = args[++index];
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
    const result = addEntityMainnet({
      stableLayerPackageId: parsed.stableLayerPackageId as string | undefined,
      stableRegistryId: parsed.stableRegistryId as string | undefined,
      quoteCoinType: parsed.quoteCoinType as string | undefined,
      entityType: parsed.entityType as string | undefined,
      factoryCapId: parsed.factoryCapId as string,
      brandCoinType: parsed.brandCoinType as string,
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
          `Entity type: ${result.entityType}`,
          `FactoryCap: ${result.factoryCapId}`,
          `Dry run: ${result.suggestedDryRun}`,
          `Execute: ${result.suggestedExecution}`,
        ].join('\n'),
      );
      return;
    }

    console.log(
      [
        'StableLayer entity activation completed.',
        `FactoryCap: ${result.factoryCapId}`,
        `Tx digest: ${result.addEntityTxDigest}`,
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
