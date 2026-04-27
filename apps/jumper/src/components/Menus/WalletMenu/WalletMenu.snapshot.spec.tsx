import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '../../../../vitest.setup';
import { WalletMenu } from './WalletMenu';

const {
  authenticated,
  currentAccount,
  currentWallet,
  disconnectWallet,
  logout,
  setLoginModalState,
  setSnackbarState,
  setWalletMenuState,
  trackEvent,
  writeText,
} = vi.hoisted(() => ({
  authenticated: { current: true },
  currentAccount: { current: null as null | { address: string } },
  currentWallet: { current: null as null | { name: string; icon?: string } },
  disconnectWallet: vi.fn(),
  logout: vi.fn(),
  setLoginModalState: vi.fn(),
  setSnackbarState: vi.fn(),
  setWalletMenuState: vi.fn(),
  trackEvent: vi.fn(),
  writeText: vi.fn(),
}));

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
      setLoginModalState,
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
    authenticated: authenticated.current,
    logout,
  }),
}));

vi.mock('@mysten/dapp-kit-react', () => ({
  useCurrentAccount: () => currentAccount.current,
  useCurrentWallet: () => currentWallet.current,
  useDAppKit: () => ({ disconnectWallet }),
}));

describe('WalletMenu', () => {
  beforeEach(() => {
    authenticated.current = true;
    currentAccount.current = null;
    currentWallet.current = null;
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

  it('shows the external Sui wallet panel beside the Privy section when both connect', () => {
    currentAccount.current = { address: '0xexternal-sui-address-12345678' };
    currentWallet.current = { icon: 'data:image/svg+xml;base64,AAA', name: 'Suiet' };

    render(<WalletMenu />);

    expect(screen.getByText('External Sui wallet')).toBeInTheDocument();
    expect(screen.getByText('Suiet')).toBeInTheDocument();
    expect(
      screen.getByText('0xexternal-sui-address-12345678'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Disconnect external Sui wallet'),
    ).toBeInTheDocument();
    // Privy block still present
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });

  it('disconnects the external Sui wallet via dapp-kit when the button is clicked', () => {
    currentAccount.current = { address: '0xexternal-sui-address-12345678' };
    currentWallet.current = { name: 'Slush' };

    render(<WalletMenu />);

    fireEvent.click(screen.getByLabelText('Disconnect external Sui wallet'));

    expect(disconnectWallet).toHaveBeenCalledTimes(1);
  });

  it('renders Sui-only mode without Privy account info when not authenticated', () => {
    authenticated.current = false;
    currentAccount.current = { address: '0xsui-only-user-address' };
    currentWallet.current = { name: 'Slush' };

    render(<WalletMenu />);

    expect(screen.getByText('External Sui wallet')).toBeInTheDocument();
    expect(screen.queryByText('user@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText(/Email login/)).not.toBeInTheDocument();
    // Logout button hidden
    expect(screen.queryByText('Log out')).not.toBeInTheDocument();
    // Sign-in CTA shown
    expect(
      screen.getByText('Sign in with email or Google'),
    ).toBeInTheDocument();
  });

  it('opens the LoginModal when the sign-in CTA is clicked from Sui-only mode', () => {
    authenticated.current = false;
    currentAccount.current = { address: '0xsui-only-user-address' };
    currentWallet.current = { name: 'Slush' };

    render(<WalletMenu />);

    fireEvent.click(screen.getByText('Sign in with email or Google'));

    expect(setLoginModalState).toHaveBeenCalledWith(true);
    expect(setWalletMenuState).toHaveBeenCalledWith(false);
  });
});
