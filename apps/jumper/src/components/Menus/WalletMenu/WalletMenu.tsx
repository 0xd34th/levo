"use client";

import { useWalletFleet } from "@/hooks/useWalletFleet";
import {
  canonicalWalletFleetOrder,
  type WalletFleetUserSummary,
  type WalletFleetChain,
} from "@/lib/privy/wallet-fleet";
import { TrackingAction, TrackingCategory } from "@/const/trackingKeys";
import { useUserTracking } from "@/hooks/userTracking";
import { useMenuStore } from "@/stores/menu";
import { useSuiPreferenceStore } from "@/stores/wallet";
import { copyTextToClipboard } from "@/utils/copyTextToClipboard";
import { walletDigest } from "@/utils/walletDigest";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import LinkOffRoundedIcon from "@mui/icons-material/LinkOffRounded";
import {
  alpha,
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import {
  useCurrentAccount,
  useCurrentWallet,
  useDAppKit,
} from "@mysten/dapp-kit-react";
import { usePrivy } from "@privy-io/react-auth";
import { useTranslation } from "react-i18next";
import { WalletButton, CustomDrawer } from "./WalletMenu.style";

const chainLabels: Record<WalletFleetChain, string> = {
  evm: "EVM",
  solana: "Solana",
  sui: "Sui",
  bitcoin: "Bitcoin",
};

const loginMethodLabels: Record<
  WalletFleetUserSummary["loginMethod"],
  string
> = {
  email: "Email",
  google: "Google",
  unknown: "Privy",
  wallet: "Wallet",
};

export const WalletMenu = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { authenticated, logout } = usePrivy();
  const { trackEvent } = useUserTracking();
  const walletFleet = useWalletFleet();
  const externalSuiAccount = useCurrentAccount();
  const externalSuiWallet = useCurrentWallet();
  const dAppKit = useDAppKit();
  const { preferredSuiSource, setPreferredSuiSource } = useSuiPreferenceStore(
    (state) => ({
      preferredSuiSource: state.preferredSuiSource,
      setPreferredSuiSource: state.setPreferredSuiSource,
    }),
  );
  const hasPrivySuiWallet = Boolean(walletFleet.data?.wallets.sui?.publicKey);
  const hasDualSuiSession = Boolean(
    externalSuiAccount?.address && hasPrivySuiWallet,
  );
  const effectivePrimary = preferredSuiSource === "privy" ? "privy" : "external";
  const {
    openWalletMenu,
    setLoginModalState,
    setSnackbarState,
    setWalletMenuState,
  } = useMenuStore((state) => ({
    openWalletMenu: state.openWalletMenu,
    setLoginModalState: state.setLoginModalState,
    setSnackbarState: state.setSnackbarState,
    setWalletMenuState: state.setWalletMenuState,
  }));

  const email = walletFleet.data?.user.email ?? "Privy account";
  const loginMethod =
    loginMethodLabels[walletFleet.data?.user.loginMethod ?? "unknown"];

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

  const handleDisconnectExternalSui = async () => {
    try {
      await dAppKit.disconnectWallet();
    } catch (err) {
      console.error("Failed to disconnect Sui wallet", err);
    }
  };

  const handleSwitchExternalSui = async () => {
    try {
      await dAppKit.disconnectWallet();
    } catch (err) {
      console.error("Failed to disconnect Sui wallet", err);
    }
    setWalletMenuState(false);
    setLoginModalState(true);
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
        {authenticated ? (
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
        ) : null}
      </Stack>

      {authenticated ? (
        <>
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
                    <Stack
                      direction="row"
                      spacing={0.5}
                      sx={{ alignItems: "center" }}
                    >
                      {chain === "sui" && hasDualSuiSession ? (
                        <Tooltip title="Signs Sui transactions and pre-fills the destination address">
                          <Chip
                            size="small"
                            variant={
                              effectivePrimary === "privy"
                                ? "outlined"
                                : "filled"
                            }
                            color="primary"
                            label={
                              effectivePrimary === "privy"
                                ? "Primary"
                                : "Set as primary"
                            }
                            clickable={effectivePrimary !== "privy"}
                            onClick={
                              effectivePrimary === "privy"
                                ? undefined
                                : () => setPreferredSuiSource("privy")
                            }
                            aria-label={
                              effectivePrimary === "privy"
                                ? "Privy embedded Sui is primary"
                                : "Set Privy embedded Sui as primary"
                            }
                            sx={{
                              fontWeight: 600,
                              ...(effectivePrimary !== "privy" && {
                                boxShadow: theme.shadows[2],
                                transition:
                                  "transform 150ms ease, box-shadow 150ms ease",
                                "&:hover": {
                                  transform: "translateY(-1px)",
                                  boxShadow: theme.shadows[4],
                                },
                              }),
                            }}
                          />
                        </Tooltip>
                      ) : null}
                      <Chip
                        size="small"
                        color={ready ? "success" : "default"}
                        label={statusLabel}
                      />
                    </Stack>
                  </Stack>
                  <Typography
                    variant="bodySmall"
                    sx={{
                      color: wallet?.address
                        ? (theme.vars || theme).palette.text.primary
                        : (theme.vars || theme).palette.text.secondary,
                      fontFamily: "monospace",
                      overflowWrap: "anywhere",
                      wordBreak: "break-all",
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
        </>
      ) : null}

      {externalSuiAccount ? (
        <>
          {authenticated ? <Divider /> : null}

          <Stack spacing={1}>
            <Typography variant="h6">External Sui wallet</Typography>
            <Typography
              variant="bodySmall"
              sx={{ color: (theme.vars || theme).palette.text.secondary }}
            >
              Connected via {externalSuiWallet?.name ?? "Sui wallet"}.
              {hasDualSuiSession
                ? effectivePrimary === "external"
                  ? " Currently signing Sui transactions."
                  : " Privy embedded is currently signing — tap Set as primary to switch."
                : " Sui transactions are signed by this wallet."}
            </Typography>
          </Stack>

          <Box
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
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {externalSuiWallet?.icon ? (
                  <Box
                    component="img"
                    alt=""
                    src={externalSuiWallet.icon}
                    sx={{ width: 20, height: 20, borderRadius: 1 }}
                  />
                ) : null}
                <Typography variant="bodyMediumStrong">
                  {externalSuiWallet?.name ?? "Sui Wallet"}
                </Typography>
              </Stack>
              <Stack
                direction="row"
                spacing={0.5}
                sx={{ alignItems: "center" }}
              >
                {hasDualSuiSession ? (
                  <Tooltip title="Signs Sui transactions and pre-fills the destination address">
                    <Chip
                      size="small"
                      variant={
                        effectivePrimary === "external" ? "outlined" : "filled"
                      }
                      color="primary"
                      label={
                        effectivePrimary === "external"
                          ? "Primary"
                          : "Set as primary"
                      }
                      clickable={effectivePrimary !== "external"}
                      onClick={
                        effectivePrimary === "external"
                          ? undefined
                          : () => setPreferredSuiSource("external")
                      }
                      aria-label={
                        effectivePrimary === "external"
                          ? "External Sui wallet is primary"
                          : "Set external Sui wallet as primary"
                      }
                      sx={{
                        fontWeight: 600,
                        ...(effectivePrimary !== "external" && {
                          boxShadow: theme.shadows[2],
                          transition:
                            "transform 150ms ease, box-shadow 150ms ease",
                          "&:hover": {
                            transform: "translateY(-1px)",
                            boxShadow: theme.shadows[4],
                          },
                        }),
                      }}
                    />
                  </Tooltip>
                ) : null}
                <Chip color="success" label="Connected" size="small" />
              </Stack>
            </Stack>
            <Typography
              variant="bodySmall"
              sx={{
                color: (theme.vars || theme).palette.text.primary,
                fontFamily: "monospace",
                overflowWrap: "anywhere",
                wordBreak: "break-all",
              }}
            >
              {externalSuiAccount.address}
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", justifyContent: "space-between", mt: 0.5 }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography
                  variant="bodyXSmall"
                  sx={{ color: (theme.vars || theme).palette.text.secondary }}
                >
                  {walletDigest(externalSuiAccount.address)}
                </Typography>
                <IconButton
                  size="small"
                  aria-label={`${t("navbar.walletMenu.copy")} external Sui wallet address`}
                  onClick={() => handleCopyAddress(externalSuiAccount.address)}
                  sx={{
                    color: (theme.vars || theme).palette.text.secondary,
                    p: 0.5,
                  }}
                >
                  <ContentCopyRoundedIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Stack>
              <Stack direction="row" spacing={0.5}>
                <WalletButton
                  aria-label="Switch external Sui wallet"
                  onClick={handleSwitchExternalSui}
                  sx={{ width: "auto" }}
                >
                  <Typography
                    sx={{ color: (theme.vars || theme).palette.text.primary }}
                    variant="bodySmallStrong"
                  >
                    Switch
                  </Typography>
                </WalletButton>
                <WalletButton
                  aria-label="Disconnect external Sui wallet"
                  onClick={handleDisconnectExternalSui}
                  sx={{ width: "auto" }}
                >
                  <LinkOffRoundedIcon sx={{ fontSize: 16, mr: 0.5 }} />
                  <Typography
                    sx={{ color: (theme.vars || theme).palette.text.primary }}
                    variant="bodySmallStrong"
                  >
                    Disconnect
                  </Typography>
                </WalletButton>
              </Stack>
            </Stack>
          </Box>
        </>
      ) : null}

      {authenticated && !externalSuiAccount ? (
        <Stack spacing={1.5}>
          <Divider />
          <Typography
            variant="bodySmall"
            sx={{ color: (theme.vars || theme).palette.text.secondary }}
          >
            Prefer signing Sui transactions with your own wallet? Connect a
            Sui wallet — it will take priority over the Privy embedded one.
          </Typography>
          <WalletButton
            sx={{ width: "auto", alignSelf: "flex-start" }}
            onClick={() => {
              setWalletMenuState(false);
              setLoginModalState(true);
            }}
          >
            <Typography
              sx={{ color: (theme.vars || theme).palette.text.primary }}
              variant="bodySmallStrong"
            >
              Connect a Sui wallet
            </Typography>
          </WalletButton>
        </Stack>
      ) : null}

      {!authenticated ? (
        <Stack spacing={1.5}>
          <Divider />
          <Typography
            variant="bodySmall"
            sx={{ color: (theme.vars || theme).palette.text.secondary }}
          >
            Want to swap to Ethereum, Solana or Bitcoin too? Sign in with email
            or Google to provision them.
          </Typography>
          <WalletButton
            sx={{ width: "auto", alignSelf: "flex-start" }}
            onClick={() => {
              setWalletMenuState(false);
              setLoginModalState(true);
            }}
          >
            <Typography
              sx={{ color: (theme.vars || theme).palette.text.primary }}
              variant="bodySmallStrong"
            >
              Sign in with email or Google
            </Typography>
          </WalletButton>
        </Stack>
      ) : null}
    </CustomDrawer>
  );
};
