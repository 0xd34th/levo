"use client";

import { useMenuStore } from "@/stores/menu";
import { CloseRounded, EmailRounded, Google } from "@mui/icons-material";
import { Modal, Stack, Typography } from "@mui/material";
import {
  useCurrentAccount,
  useDAppKit,
  useWallets,
  type UiWallet,
} from "@mysten/dapp-kit-react";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef, type FC } from "react";
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

  // Snapshot which sessions already existed when the modal opened so we
  // only auto-close when a NEW session appears. Without this, a Sui-only
  // user opening the modal to add a Privy session would see the modal
  // immediately re-close because currentAccount has been set the whole time.
  const sessionAtOpenRef = useRef<{
    authenticated: boolean;
    externalSuiAddress: string | null;
  }>({ authenticated: false, externalSuiAddress: null });

  useEffect(() => {
    if (openLoginModal) {
      sessionAtOpenRef.current = {
        authenticated,
        externalSuiAddress: currentAccount?.address ?? null,
      };
    }
    // We only want to refresh the baseline when the modal opens, not whenever
    // the underlying sessions tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openLoginModal]);

  useEffect(() => {
    if (!openLoginModal) {
      return;
    }

    const baseline = sessionAtOpenRef.current;
    const newPrivySession = authenticated && !baseline.authenticated;
    const newSuiSession =
      currentAccount?.address &&
      currentAccount.address !== baseline.externalSuiAddress;

    if (newPrivySession || newSuiSession) {
      setLoginModalState(false);
    }
  }, [
    authenticated,
    currentAccount?.address,
    openLoginModal,
    setLoginModalState,
  ]);

  const handleClose = () => setLoginModalState(false);

  const handlePrivyEmailLogin = () => {
    // Dismiss our chooser before Privy mounts its own modal so the
    // two never stack on top of each other.
    setLoginModalState(false);
    // Restrict the Privy popup to only the email method for this attempt
    // — keeps the chooser semantics consistent: clicking "Email" goes
    // straight to email entry, no other CTAs in Privy's modal.
    login({ loginMethods: ["email"] });
  };

  const handlePrivyGoogleLogin = () => {
    setLoginModalState(false);
    login({ loginMethods: ["google"] });
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

        <Stack spacing={1}>
          <LoginPrimaryButton
            color="primary"
            onClick={handlePrivyEmailLogin}
            startIcon={<EmailRounded />}
            variant="contained"
          >
            Continue with Email
          </LoginPrimaryButton>
          <LoginPrimaryButton
            color="primary"
            onClick={handlePrivyGoogleLogin}
            startIcon={<Google />}
            variant="outlined"
          >
            Continue with Google
          </LoginPrimaryButton>
        </Stack>

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
