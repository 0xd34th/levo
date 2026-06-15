import { expect, test, type Page } from '@playwright/test';
import { ChainId, ChainType, CoinKey } from '@lifi/sdk';
import { closeWelcomeScreen } from './testData/landingPageFunctions';

const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOLANA_NATIVE = '11111111111111111111111111111111';
const SOLANA_SUI = 'sui-on-solana';
const SUI_NATIVE =
  '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';
const BASE_NATIVE = '0x0000000000000000000000000000000000000000';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const chains = [
  {
    id: ChainId.SUI,
    key: 'sui',
    name: 'Sui',
    chainType: ChainType.MVM,
    coin: 'SUI',
    mainnet: true,
    logoURI: '',
    nativeToken: {
      chainId: ChainId.SUI,
      address: SUI_NATIVE,
      symbol: 'SUI',
      name: 'Sui',
      decimals: 9,
      coinKey: CoinKey.SUI,
      priceUSD: '3',
      logoURI: '',
    },
  },
  {
    id: ChainId.SOL,
    key: 'sol',
    name: 'Solana',
    chainType: ChainType.SVM,
    coin: 'SOL',
    mainnet: true,
    logoURI: '',
    nativeToken: {
      chainId: ChainId.SOL,
      address: SOLANA_NATIVE,
      symbol: 'SOL',
      name: 'Solana',
      decimals: 9,
      coinKey: 'SOL',
      priceUSD: '150',
      logoURI: '',
    },
  },
  {
    id: ChainId.BAS,
    key: 'bas',
    name: 'Base',
    chainType: ChainType.EVM,
    coin: 'ETH',
    mainnet: true,
    logoURI: '',
    metamask: {
      chainId: `0x${Number(ChainId.BAS).toString(16)}`,
      chainName: 'Base',
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: ['https://mainnet.base.org'],
      blockExplorerUrls: ['https://basescan.org'],
    },
    nativeToken: {
      chainId: ChainId.BAS,
      address: BASE_NATIVE,
      symbol: 'ETH',
      name: 'Ether',
      decimals: 18,
      coinKey: 'ETH',
      priceUSD: '3000',
      logoURI: '',
    },
  },
];

const tokens = {
  [ChainId.SUI]: [
    {
      chainId: ChainId.SUI,
      address: SUI_NATIVE,
      symbol: 'SUI',
      name: 'Sui',
      decimals: 9,
      coinKey: CoinKey.SUI,
      priceUSD: '3',
      logoURI: '',
      verified: true,
    },
  ],
  [ChainId.SOL]: [
    {
      chainId: ChainId.SOL,
      address: SOLANA_NATIVE,
      symbol: 'SOL',
      name: 'Solana',
      decimals: 9,
      coinKey: 'SOL',
      priceUSD: '150',
      logoURI: '',
      verified: true,
    },
    {
      chainId: ChainId.SOL,
      address: SOLANA_SUI,
      symbol: 'SUI',
      name: 'Sui',
      decimals: 9,
      coinKey: undefined,
      priceUSD: '3',
      logoURI: '',
      verified: true,
    },
    {
      chainId: ChainId.SOL,
      address: SOLANA_USDC,
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      coinKey: 'USDC',
      priceUSD: '1',
      logoURI: '',
      verified: true,
    },
  ],
  [ChainId.BAS]: [
    {
      chainId: ChainId.BAS,
      address: BASE_NATIVE,
      symbol: 'ETH',
      name: 'Ether',
      decimals: 18,
      coinKey: 'ETH',
      priceUSD: '3000',
      logoURI: '',
      verified: true,
    },
    {
      chainId: ChainId.BAS,
      address: BASE_USDC,
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      coinKey: 'USDC',
      priceUSD: '1',
      logoURI: '',
      verified: true,
    },
  ],
};

test.describe('chain-first token selection', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await installLifiMocks(page);
    await page.addInitScript(() => window.localStorage.clear());
  });

  test('shows asset placeholders on the exchange form', async ({
    page,
  }) => {
    await openWidget(page);

    await expect(assetPickerButton(page, 'From')).toContainText('Select asset');
    await expect(assetPickerButton(page, 'To')).toContainText('Select asset');
  });

  test('opens From asset selection on the asset list', async ({
    page,
  }) => {
    await openWidget(page);

    await openAssetPicker(page, 'From');

    await expect(page.getByText('Select asset to swap from')).toBeVisible();
    await expect(tokenOption(page, 'SOL')).toBeVisible();
    await expect(tokenOption(page, 'SUI')).toBeVisible();
    await expect(tokenOption(page, 'USDC')).toBeVisible();
    await expect(tokenOption(page, 'ETH')).toBeVisible();
  });

  test('opens To asset selection on the asset list', async ({
    page,
  }) => {
    await openWidget(page);

    await openAssetPicker(page, 'To');

    await expect(page.getByText('Select asset to receive')).toBeVisible();
    await expect(tokenOption(page, 'SOL')).toBeVisible();
    await expect(tokenOption(page, 'SUI')).toBeVisible();
    await expect(tokenOption(page, 'USDC')).toBeVisible();
    await expect(tokenOption(page, 'ETH')).toBeVisible();
  });

  test('hydrates chain and token deep links into asset and chain selectors', async ({
    page,
  }) => {
    await openWidget(
      page,
      `/en?fromChain=${ChainId.SUI}&fromToken=${SUI_NATIVE}&toChain=${ChainId.SOL}&toToken=${SOLANA_USDC}`,
    );

    await expect(assetPickerButton(page, 'From')).toContainText('SUI');
    await expect(sourceChainChip(page)).toContainText('Sui');
    await expect(assetPickerButton(page, 'To')).toContainText('USDC');
    await expect(destinationChainChip(page)).toContainText('Solana');
  });

  test('lets users manually select Solana USDC as the destination after choosing Sui SUI', async ({
    page,
  }) => {
    await openWidget(page);

    await openAssetPicker(page, 'From');
    await tokenOption(page, 'SUI').click();

    await expect(assetPickerButton(page, 'From')).toContainText('SUI');
    await expect(sourceChainChip(page)).toContainText('Sui');

    await openAssetPicker(page, 'To');
    await tokenOption(page, 'USDC').click();

    await expect(page.getByText('Destination chain')).toBeVisible();

    await destinationChainChip(page).click();
    const solanaOption = page
      .getByRole('list')
      .getByRole('button', {
        name: /Solana/i,
      });
    await expect(solanaOption).toBeVisible();
    await solanaOption.click();

    await expect(page).toHaveURL(
      new RegExp(`[?&]toChain=${ChainId.SOL}`),
    );
    await expect(page).toHaveURL(new RegExp(`[?&]toToken=${SOLANA_USDC}`));
    await expect(destinationChainChip(page)).toContainText('Solana');
    await expect(assetPickerButton(page, 'To')).toContainText('USDC');
  });

  test('hydrates the destination chain selector from toChain and toToken deep links', async ({
    page,
  }) => {
    await openWidget(
      page,
      `/en?toChain=${ChainId.BAS}&toToken=${BASE_USDC}`,
    );

    await expect(page.getByText('Destination chain')).toBeVisible();
    await expect(destinationChainChip(page)).toContainText('Base');
    await expect(assetPickerButton(page, 'To')).toContainText('USDC');
  });
});

async function openWidget(page: Page, url = '/en') {
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  await closeWelcomeScreen(page);
}

async function openAssetPicker(page: Page, label: 'From' | 'To') {
  await assetPickerButton(page, label).click();
}

function assetPickerButton(page: Page, label: 'From' | 'To') {
  return page
    .getByText(label, { exact: true })
    .locator('..')
    .getByRole('button')
    .first();
}

function tokenOption(page: Page, symbol: string) {
  return page.getByText(symbol, { exact: true }).first();
}

function destinationChainChip(page: Page) {
  return chainChip(page, 'Destination chain');
}

function sourceChainChip(page: Page) {
  return chainChip(page, 'Source chain');
}

function chainChip(page: Page, label: 'Source chain' | 'Destination chain') {
  return page
    .getByText(label, { exact: true })
    .locator('..')
    .getByRole('button')
    .first();
}

async function installLifiMocks(page: Page) {
  await page.route('**/chains?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ chains }),
    });
  });

  await page.route('**/tokens?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ tokens }),
    });
  });

  await page.route('**/token?**', async (route) => {
    const url = new URL(route.request().url());
    const chainId = Number(url.searchParams.get('chain'));
    const tokenAddress = url.searchParams.get('token')?.toLowerCase();
    const token = Object.values(tokens)
      .flat()
      .find(
        (candidate) =>
          candidate.chainId === chainId &&
          candidate.address.toLowerCase() === tokenAddress,
      );

    await route.fulfill({
      contentType: 'application/json',
      status: token ? 200 : 404,
      body: JSON.stringify(token ?? { message: 'Token not found' }),
    });
  });
}
