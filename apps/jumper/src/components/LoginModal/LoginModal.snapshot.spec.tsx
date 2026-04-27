import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render as rtlRender,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { themeCustomized } from "../../../src/theme/theme";
import { render } from "../../../vitest.setup";
import { LoginModal } from "./LoginModal";

const TestWrapper = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={themeCustomized}>{children}</ThemeProvider>
    </QueryClientProvider>
  );
};

const { authenticated, connectWallet, currentAccount, login, setLoginModalState, wallets } =
  vi.hoisted(() => ({
    authenticated: { current: false },
    connectWallet: vi.fn().mockResolvedValue({ accounts: [] }),
    currentAccount: { current: null as null | { address: string } },
    login: vi.fn(),
    setLoginModalState: vi.fn(),
    wallets: { current: [] as Array<{ name: string; icon?: string }> },
  }));

const menuState = { openLoginModal: true };

vi.mock("@/stores/menu", () => ({
  useMenuStore: (selector: (state: any) => any) =>
    selector({
      openLoginModal: menuState.openLoginModal,
      setLoginModalState,
    }),
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    authenticated: authenticated.current,
    login,
  }),
}));

vi.mock("@mysten/dapp-kit-react", () => ({
  useCurrentAccount: () => currentAccount.current,
  useDAppKit: () => ({ connectWallet }),
  useWallets: () => wallets.current,
}));

describe("LoginModal", () => {
  beforeEach(() => {
    authenticated.current = false;
    currentAccount.current = null;
    wallets.current = [];
    menuState.openLoginModal = true;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Email and Google CTAs alongside the empty Sui hint", () => {
    render(<LoginModal />);

    expect(
      screen.getByRole("button", { name: /Continue with Email/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Continue with Google/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/No Sui wallets detected/i)).toBeInTheDocument();
  });

  it("lists installed Sui wallets and connects the chosen one", async () => {
    wallets.current = [
      { icon: "data:image/svg+xml;base64,iconA", name: "Suiet" },
      { icon: "data:image/svg+xml;base64,iconB", name: "Slush" },
    ];

    render(<LoginModal />);

    const suietButton = screen.getByRole("button", { name: /Suiet/ });
    fireEvent.click(suietButton);

    expect(connectWallet).toHaveBeenCalledWith({ wallet: wallets.current[0] });
    expect(screen.getByRole("button", { name: /Slush/ })).toBeInTheDocument();
  });

  it("dismisses the modal before delegating to a Sui wallet's approval flow", () => {
    wallets.current = [{ name: "Slush" }];

    render(<LoginModal />);

    fireEvent.click(screen.getByRole("button", { name: /Slush/ }));

    expect(setLoginModalState).toHaveBeenCalledWith(false);
  });

  it("triggers Privy email-only login when the Email CTA is clicked", () => {
    render(<LoginModal />);

    fireEvent.click(
      screen.getByRole("button", { name: /Continue with Email/i }),
    );

    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith({ loginMethods: ["email"] });
  });

  it("triggers Privy google-only login when the Google CTA is clicked", () => {
    render(<LoginModal />);

    fireEvent.click(
      screen.getByRole("button", { name: /Continue with Google/i }),
    );

    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith({ loginMethods: ["google"] });
  });

  it("dismisses the modal before opening the Privy login flow", () => {
    render(<LoginModal />);

    fireEvent.click(
      screen.getByRole("button", { name: /Continue with Email/i }),
    );

    expect(setLoginModalState).toHaveBeenCalledWith(false);
  });

  it("auto-closes when Privy authentication transitions to truthy after open", () => {
    const { rerender } = rtlRender(<LoginModal />, { wrapper: TestWrapper });

    // Modal opened with no Privy session — baseline captured.
    expect(setLoginModalState).not.toHaveBeenCalledWith(false);

    authenticated.current = true;
    rerender(<LoginModal />);

    expect(setLoginModalState).toHaveBeenCalledWith(false);
  });

  it("auto-closes when a NEW Sui wallet address appears after open", () => {
    const { rerender } = rtlRender(<LoginModal />, { wrapper: TestWrapper });

    expect(setLoginModalState).not.toHaveBeenCalledWith(false);

    currentAccount.current = { address: "0xnew-sui-address" };
    rerender(<LoginModal />);

    expect(setLoginModalState).toHaveBeenCalledWith(false);
  });

  it("does NOT auto-close if a Sui session already existed when the modal opened", () => {
    // Sui-only user opens LoginModal to add a Privy session.
    currentAccount.current = { address: "0xexisting-sui" };

    render(<LoginModal />);

    expect(setLoginModalState).not.toHaveBeenCalledWith(false);
  });
});
