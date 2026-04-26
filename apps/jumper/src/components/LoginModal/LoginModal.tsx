"use client";

import { useMenuStore } from "@/stores/menu";
import { CloseRounded } from "@mui/icons-material";
import { Modal, Stack, Typography } from "@mui/material";
import {
  useCurrentAccount,
  useDAppKit,
  useWallets,
  type UiWallet,
} from "@mysten/dapp-kit-react";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect, type FC } from "react";
import {
  LoginDivider,
  LoginModalCloseButton,
  LoginModalContainer,
  LoginModalHeader,
  LoginPrimaryButton,
  SuiEmptyHint,
  SuiWalletButton,
  SuiWalletIcon,
} from "./LoginModal.style";

export const LoginModal: FC = () => {
  const { openLoginModal, setLoginModalState } = useMenuStore((state) => ({
    openLoginModal: state.openLoginModal,
    setLoginModalState: state.setLoginModalState,
  }));
  const { authenticated, login } = usePrivy();
  const dAppKit = useDAppKit();
  const wallets = useWallets();
  const currentAccount = useCurrentAccount();

  useEffect(() => {
    if (openLoginModal && authenticated) {
      setLoginModalState(false);
    }
  }, [authenticated, openLoginModal, setLoginModalState]);

  useEffect(() => {
    if (openLoginModal && currentAccount) {
      setLoginModalState(false);
    }
  }, [currentAccount, openLoginModal, setLoginModalState]);

  const handleClose = () => setLoginModalState(false);

  const handlePrivyLogin = () => {
    // Dismiss our chooser before Privy mounts its own modal so the
    // two never stack on top of each other.
    setLoginModalState(false);
    login();
  };

  const handleConnectSui = async (wallet: UiWallet) => {
    // Same reasoning as Privy: hand the screen over to the wallet's
    // own approval popup (browser extension or Slush web wallet popup).
    setLoginModalState(false);
    try {
      await dAppKit.connectWallet({ wallet });
    } catch (err) {
      console.error("Failed to connect Sui wallet", err);
    }
  };

  return (
    <Modal aria-labelledby="login-modal-title" onClose={handleClose} open={openLoginModal}>
      <LoginModalContainer>
        <LoginModalHeader>
          <Typography id="login-modal-title" sx={{ fontWeight: 700 }} variant="h6">
            Sign in to Jumper
          </Typography>
          <LoginModalCloseButton aria-label="Close" onClick={handleClose} size="small">
            <CloseRounded fontSize="small" />
          </LoginModalCloseButton>
        </LoginModalHeader>

        <LoginPrimaryButton color="primary" onClick={handlePrivyLogin} variant="contained">
          Continue with Email, Google, EVM or Solana wallet
        </LoginPrimaryButton>

        <LoginDivider>or connect a Sui wallet</LoginDivider>

        {wallets.length === 0 ? (
          <SuiEmptyHint>
            No Sui wallets detected. Install Suiet, Slush, or Phantom (Sui mode) and reload.
          </SuiEmptyHint>
        ) : (
          <Stack spacing={1}>
            {wallets.map((wallet) => (
              <SuiWalletButton
                key={wallet.name}
                onClick={() => handleConnectSui(wallet)}
                variant="text"
              >
                {wallet.icon ? <SuiWalletIcon alt="" src={wallet.icon} /> : null}
                <Typography sx={{ fontWeight: 600 }}>{wallet.name}</Typography>
              </SuiWalletButton>
            ))}
          </Stack>
        )}
      </LoginModalContainer>
    </Modal>
  );
};
