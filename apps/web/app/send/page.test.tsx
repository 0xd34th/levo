import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/mobile-top-bar', () => ({
  MobileTopBar: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@/components/amount-input', () => ({
  AmountInput: () => <div>AmountInput</div>,
}));

vi.mock('@/components/coin-selector', () => ({
  CoinSelector: () => <div>CoinSelector</div>,
}));

vi.mock('@/components/send-button', () => ({
  SendButton: () => <button type="button">Send</button>,
}));

vi.mock('@/components/transaction-result', () => ({
  TransactionResult: () => <div>TransactionResult</div>,
}));

vi.mock('@/components/username-input', () => ({
  UsernameInput: () => <div>UsernameInput</div>,
}));

vi.mock('@/lib/coins', () => ({
  SUI_COIN_TYPE: '0x2::sui::SUI',
  getUserFacingUsdcCoinType: () => '0x2::usdc::USDC',
}));

vi.mock('@/lib/received-dashboard-client', () => ({
  truncateAddress: (address: string) => address,
}));

vi.mock('@/lib/recipient', () => ({
  detectRecipientType: () => null,
}));

vi.mock('@/lib/send-form', () => ({
  sanitizeAmountForCoinType: (amount: string) => amount,
}));

vi.mock('@/lib/use-coin-balance', () => ({
  useCoinBalance: () => ({ balance: '1000000' }),
}));

vi.mock('@/lib/use-embedded-wallet', () => ({
  useEmbeddedWallet: () => ({
    suiAddress: '0x1234',
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

import SendPage from './page';

describe('SendPage', () => {
  it('does not render a fabricated network fee disclosure', () => {
    const markup = renderToStaticMarkup(<SendPage />);

    expect(markup).not.toContain('Network fee');
    expect(markup).not.toContain('~$0.002');
    expect(markup).toContain('Deposit funds here first to send.');
  });
});
