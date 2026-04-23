"use client";

import { useWalletFleet } from "@/hooks/useWalletFleet";
import {
  canonicalWalletFleetOrder,
  type WalletFleetChain,
} from "@/lib/privy/wallet-fleet";
import { TrackingAction, TrackingCategory } from "@/const/trackingKeys";
import { useUserTracking } from "@/hooks/userTracking";
import { useMenuStore } from "@/stores/menu";
import { copyTextToClipboard } from "@/utils/copyTextToClipboard";
import { walletDigest } from "@/utils/walletDigest";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import {
  alpha,
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { usePrivy } from "@privy-io/react-auth";
import { useTranslation } from "react-i18next";
import { WalletButton, CustomDrawer } from "./WalletMenu.style";

const chainLabels: Record<WalletFleetChain, string> = {
  evm: "EVM",
  solana: "Solana",
  sui: "Sui",
  bitcoin: "Bitcoin",
};

export const WalletMenu = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { logout } = usePrivy();
  const { trackEvent } = useUserTracking();
  const walletFleet = useWalletFleet();
  const { openWalletMenu, setSnackbarState, setWalletMenuState } = useMenuStore(
    (state) => ({
      openWalletMenu: state.openWalletMenu,
      setSnackbarState: state.setSnackbarState,
      setWalletMenuState: state.setWalletMenuState,
    }),
  );

  const email = walletFleet.data?.user.email ?? "Privy account";
  const loginMethod =
    walletFleet.data?.user.loginMethod === "google" ? "Google" : "Email";

  const handleCopyAddress = async (address: string) => {
    const copied = await copyTextToClipboard(address);
    if (!copied) {
      return;
    }

    setSnackbarState(true, t("navbar.walletMenu.copiedMsg"), "success");
    trackEvent({
      category: TrackingCategory.WalletMenu,
      action: TrackingAction.CopyAddressToClipboard,
      label: "copy_addr_to_clipboard",
    });
  };

  return (
    <CustomDrawer
      data-testid="wallet-drawer"
      open={openWalletMenu}
      anchor="right"
      onClose={() => {
        setWalletMenuState(false);
      }}
      slotProps={{ backdrop: { sx: { backdropFilter: "blur(8px)" } } }}
    >
      <Stack
        direction="row"
        sx={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <IconButton
          aria-label="close"
          onClick={() => setWalletMenuState(false)}
          sx={{
            color: (theme.vars || theme).palette.text.primary,
            "&:hover": {
              backgroundColor: alpha(theme.palette.text.primary, 0.04),
            },
          }}
        >
          <CloseIcon />
        </IconButton>
        <WalletButton
          id="logout-account-button"
          sx={{ width: "auto" }}
          onClick={async () => {
            await logout();
            setWalletMenuState(false);
          }}
        >
          <Typography
            sx={{ color: (theme.vars || theme).palette.text.primary }}
            variant="bodySmallStrong"
          >
            Log out
          </Typography>
        </WalletButton>
      </Stack>

      <Stack spacing={1}>
        <Typography variant="h6">{email}</Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
          <Chip label={`${loginMethod} login`} size="small" />
          <Chip label="1 account = wallets on all chains" size="small" />
        </Stack>
        <Typography
          variant="bodySmall"
          sx={{ color: (theme.vars || theme).palette.text.secondary }}
        >
          Source wallet and destination wallet are filled from this account
          automatically.
        </Typography>
      </Stack>

      <Divider />

      <Stack spacing={1.5}>
        {walletFleet.isLoading ? (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
              color: (theme.vars || theme).palette.text.secondary,
            }}
          >
            <CircularProgress size={16} />
            <Typography variant="bodySmall">
              Preparing chain wallets...
            </Typography>
          </Stack>
        ) : null}

        {canonicalWalletFleetOrder.map((chain) => {
          const wallet = walletFleet.data?.wallets[chain];
          const unavailable = walletFleet.isError;
          const ready = walletFleet.data?.readyStates[chain] ?? false;
          const statusLabel = ready
            ? "Ready"
            : unavailable
              ? "Unavailable"
              : "Pending";
          const walletStateCopy = wallet?.address
            ? wallet.address
            : unavailable
              ? "Wallet temporarily unavailable"
              : "Wallet is being provisioned";

          return (
            <Box
              key={chain}
              sx={{
                p: 1.5,
                borderRadius: 3,
                border: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
                backgroundColor: alpha(theme.palette.text.primary, 0.02),
              }}
            >
              <Stack
                direction="row"
                sx={{
                  alignItems: "center",
                  justifyContent: "space-between",
                  mb: 0.75,
                }}
              >
                <Typography variant="bodyMediumStrong">
                  {chainLabels[chain]}
                </Typography>
                <Chip
                  size="small"
                  color={ready ? "success" : "default"}
                  label={statusLabel}
                />
              </Stack>
              <Typography
                variant="bodySmall"
                sx={{
                  color: wallet?.address
                    ? (theme.vars || theme).palette.text.primary
                    : (theme.vars || theme).palette.text.secondary,
                  fontFamily: "monospace",
                }}
              >
                {walletStateCopy}
              </Typography>
              {wallet?.address ? (
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center", mt: 0.5 }}
                >
                  <Typography
                    variant="bodyXSmall"
                    sx={{ color: (theme.vars || theme).palette.text.secondary }}
                  >
                    {walletDigest(wallet.address)}
                  </Typography>
                  <IconButton
                    size="small"
                    aria-label={`${t("navbar.walletMenu.copy")} ${chainLabels[chain]} wallet address`}
                    onClick={() => handleCopyAddress(wallet.address)}
                    sx={{
                      color: (theme.vars || theme).palette.text.secondary,
                      p: 0.5,
                    }}
                  >
                    <ContentCopyRoundedIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Stack>
              ) : null}
            </Box>
          );
        })}
      </Stack>
    </CustomDrawer>
  );
};
