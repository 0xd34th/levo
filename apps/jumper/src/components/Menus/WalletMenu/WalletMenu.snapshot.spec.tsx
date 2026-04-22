import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '../../../../vitest.setup';
import { WalletMenu } from './WalletMenu';

const { logout, setSnackbarState, setWalletMenuState, trackEvent, writeText } = vi.hoisted(
  () => ({
    logout: vi.fn(),
    setSnackbarState: vi.fn(),
    setWalletMenuState: vi.fn(),
    trackEvent: vi.fn(),
    writeText: vi.fn(),
  }),
);

vi.mock('@/hooks/useWalletFleet', () => ({
  useWalletFleet: () => ({
    isLoading: false,
    data: {
      user: {
        email: 'user@example.com',
        loginMethod: 'email',
      },
      readyStates: {
        evm: true,
        solana: true,
        sui: true,
        bitcoin: false,
      },
      wallets: {
        evm: {
          address: '0x1234567890abcdef1234567890abcdef12345678',
        },
        solana: {
          address: 'So11111111111111111111111111111111111111112',
        },
        sui: {
          address: '0xsuiwallet1234567890abcdef1234567890abcdef',
        },
      },
    },
  }),
}));

vi.mock('@/stores/menu', () => ({
  useMenuStore: (selector: (state: any) => any) =>
    selector({
      openWalletMenu: true,
      setSnackbarState,
      setWalletMenuState,
    }),
}));

vi.mock('@/hooks/userTracking', () => ({
  useUserTracking: () => ({
    trackEvent,
  }),
}));

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({
    logout,
  }),
}));

describe('WalletMenu', () => {
  beforeEach(() => {
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders copy actions for ready wallets', () => {
    render(<WalletMenu />);

    expect(
      screen.getByLabelText('navbar.walletMenu.copy EVM wallet address'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('navbar.walletMenu.copy Solana wallet address'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('navbar.walletMenu.copy Sui wallet address'),
    ).toBeInTheDocument();
  });

  it('copies the selected wallet address and shows feedback', async () => {
    render(<WalletMenu />);

    fireEvent.click(
      screen.getByLabelText('navbar.walletMenu.copy EVM wallet address'),
    );

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        '0x1234567890abcdef1234567890abcdef12345678',
      );
    });

    expect(setSnackbarState).toHaveBeenCalledWith(
      true,
      'navbar.walletMenu.copiedMsg',
      'success',
    );
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'copy_addr_to_clipboard',
      }),
    );
  });
});
