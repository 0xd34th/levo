import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  formatAmountMock,
  getCoinDecimalsMock,
  getCoinLabelMock,
  getInputDecimalsMock,
  isValidAmountInputMock,
} = vi.hoisted(() => ({
  formatAmountMock: vi.fn(),
  getCoinDecimalsMock: vi.fn(),
  getCoinLabelMock: vi.fn(),
  getInputDecimalsMock: vi.fn(),
  isValidAmountInputMock: vi.fn(),
}));

vi.mock('@privy-io/react-auth', () => ({
  useAuthorizationSignature: () => ({
    generateAuthorizationSignature: vi.fn(),
  }),
  useIdentityToken: () => ({
    identityToken: null,
  }),
  usePrivy: () => ({
    getAccessToken: vi.fn(),
  }),
}));

vi.mock('@/components/recipient-confirmation-modal', () => ({
  RecipientConfirmationModal: () => null,
}));

vi.mock('@/lib/coins', () => ({
  SUI_COIN_TYPE: '0x2::sui::SUI',
  formatAmount: formatAmountMock,
  getCoinDecimals: getCoinDecimalsMock,
  getCoinLabel: getCoinLabelMock,
  getInputDecimals: getInputDecimalsMock,
  isValidAmountInput: isValidAmountInputMock,
}));

import { SUI_COIN_TYPE } from '@/lib/coins';

import { SendButton } from './send-button';

describe('SendButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    formatAmountMock.mockReturnValue('20.00');
    getCoinDecimalsMock.mockReturnValue(6);
    getInputDecimalsMock.mockReturnValue(6);
    getCoinLabelMock.mockImplementation((coinType: string) =>
      coinType === SUI_COIN_TYPE ? 'SUI' : 'USDC',
    );
    isValidAmountInputMock.mockReturnValue(true);
  });

  it('shows a native-token label instead of a dollar prefix for SUI sends', () => {
    const markup = renderToStaticMarkup(
      <SendButton
        username="alice"
        amount="5"
        coinType={SUI_COIN_TYPE}
        recipientType={null}
        embeddedWalletAddress="0x123"
        onError={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(markup).toContain('Send 5 SUI');
    expect(markup).not.toContain('Send $5');
  });

  it('keeps the dollar prefix for dollar-denominated send flows', () => {
    const markup = renderToStaticMarkup(
      <SendButton
        username="alice"
        amount="5"
        coinType="0x123::usdc::USDC"
        recipientType={null}
        embeddedWalletAddress="0x123"
        onError={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(markup).toContain('Send $5');
  });
});
