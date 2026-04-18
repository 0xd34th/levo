import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  formatAmountMock,
  getCoinLabelMock,
  isValidAmountInputMock,
  usesDollarAmountPrefixMock,
} = vi.hoisted(() => ({
  formatAmountMock: vi.fn(),
  getCoinLabelMock: vi.fn(),
  isValidAmountInputMock: vi.fn(),
  usesDollarAmountPrefixMock: vi.fn(),
}));

vi.mock('@/lib/coins', () => ({
  formatAmount: formatAmountMock,
  getCoinLabel: getCoinLabelMock,
  isValidAmountInput: isValidAmountInputMock,
}));

vi.mock('@/lib/send-form', () => ({
  usesDollarAmountPrefix: usesDollarAmountPrefixMock,
}));

import { AmountInput } from './amount-input';

describe('AmountInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    formatAmountMock.mockReturnValue('20.00');
    getCoinLabelMock.mockReturnValue('USDC');
    isValidAmountInputMock.mockReturnValue(true);
  });

  it('uses the wider plain leading inset for amount entry', () => {
    usesDollarAmountPrefixMock.mockReturnValue(false);

    const markup = renderToStaticMarkup(
      <AmountInput
        amount="20"
        availableBalance="20000000"
        coinType="mainnet-usdc"
        onAmountChange={vi.fn()}
      />,
    );

    expect(markup).toContain('pl-6');
    expect(markup).not.toContain('pl-5');
  });

  it('uses the widened prefix spacing contract for dollar-prefixed amounts', () => {
    usesDollarAmountPrefixMock.mockReturnValue(true);

    const markup = renderToStaticMarkup(
      <AmountInput
        amount="20"
        availableBalance="20000000"
        coinType="sui"
        onAmountChange={vi.fn()}
      />,
    );

    expect(markup).toContain('left-6');
    expect(markup).toContain('pl-14');
    expect(markup).not.toContain('left-5');
    expect(markup).not.toContain('pl-10');
  });
});
