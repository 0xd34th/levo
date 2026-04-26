import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "../../../vitest.setup";
import { LoginModal } from "./LoginModal";

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

  it("renders the Privy CTA and empty hint when no Sui wallets installed", () => {
    render(<LoginModal />);

    expect(
      screen.getByRole("button", {
        name: /Continue with Email, Google, EVM or Solana wallet/i,
      }),
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

  it("triggers Privy login when the primary CTA is clicked", () => {
    render(<LoginModal />);

    fireEvent.click(
      screen.getByRole("button", {
        name: /Continue with Email, Google, EVM or Solana wallet/i,
      }),
    );

    expect(login).toHaveBeenCalledTimes(1);
  });

  it("auto-closes when Privy authentication becomes truthy", () => {
    authenticated.current = true;

    render(<LoginModal />);

    expect(setLoginModalState).toHaveBeenCalledWith(false);
  });

  it("auto-closes when a Sui wallet account becomes available", () => {
    currentAccount.current = { address: "0xabc" };

    render(<LoginModal />);

    expect(setLoginModalState).toHaveBeenCalledWith(false);
  });
});
