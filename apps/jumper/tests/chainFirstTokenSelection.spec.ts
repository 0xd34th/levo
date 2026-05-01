import { expect, test, type Page } from '@playwright/test';
import { ChainId, ChainType } from '@lifi/sdk';
import { closeWelcomeScreen } from './testData/landingPageFunctions';

const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOLANA_NATIVE = '11111111111111111111111111111111';
const BASE_NATIVE = '0x0000000000000000000000000000000000000000';

const chains = [
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
  ],
};

test.describe('chain-first token selection', () => {
  test.beforeEach(async ({ page }) => {
    await installLifiMocks(page);
    await page.addInitScript(() => window.localStorage.clear());
  });

  test('opens From token selection on a chain list before showing tokens', async ({
    page,
  }) => {
    await openWidget(page);

    await openTokenPicker(page, 'From');

    await expect(page.getByText('Select chain').first()).toBeVisible();
    await expect(page.getByText(/All networks/i)).toHaveCount(0);
    await expect(chainOption(page, 'Solana')).toBeVisible();
    await expect(page.getByRole('button', { name: /USDC/i })).toHaveCount(0);

    await chainOption(page, 'Solana').click();

    await expect(tokenOption(page, 'SOL')).toBeVisible();
    await expect(tokenOption(page, 'USDC')).toBeVisible();
  });

  test('opens To token selection on a chain list before showing tokens', async ({
    page,
  }) => {
    await openWidget(page);

    await openTokenPicker(page, 'To');

    await expect(page.getByText('Select chain').first()).toBeVisible();
    await expect(page.getByText(/All networks/i)).toHaveCount(0);
    await expect(chainOption(page, 'Solana')).toBeVisible();
    await expect(page.getByRole('button', { name: /USDC/i })).toHaveCount(0);

    await chainOption(page, 'Solana').click();

    await expect(tokenOption(page, 'SOL')).toBeVisible();
    await expect(tokenOption(page, 'USDC')).toBeVisible();
  });

  test('keeps fromChain and toChain deep links on scoped token lists', async ({
    page,
  }) => {
    await openWidget(page, `/?fromChain=${ChainId.SOL}&toChain=${ChainId.BAS}`);

    await openTokenPicker(page, 'From');

    await expect(page.getByText('Select chain').first()).toHaveCount(0);
    await expect(tokenOption(page, 'SOL')).toBeVisible();
    await expect(tokenOption(page, 'USDC')).toBeVisible();
    await expect(tokenOption(page, 'ETH')).toHaveCount(0);
  });
});

async function openWidget(page: Page, url = '/') {
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  await closeWelcomeScreen(page);
}

async function openTokenPicker(page: Page, label: 'From' | 'To') {
  await page
    .locator('.widget-wrapper button')
    .filter({ hasText: label })
    .first()
    .click();
}

function chainOption(page: Page, name: string) {
  return page.getByRole('button').filter({ hasText: name }).first();
}

function tokenOption(page: Page, symbol: string) {
  return page.getByText(symbol, { exact: true }).first();
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
