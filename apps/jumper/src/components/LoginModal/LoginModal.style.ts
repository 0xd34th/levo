"use client";

import type { Breakpoint } from "@mui/material";
import { Box, Button, IconButton } from "@mui/material";
import { styled } from "@mui/material/styles";

export const LoginModalContainer = styled(Box)(({ theme }) => ({
  position: "absolute",
  color: (theme.vars || theme).palette.text.primary,
  left: "50%",
  transform: "translate(-50%, -50%)",
  top: "50%",
  width: 416,
  maxWidth: "calc(100vw - 32px)",
  display: "flex",
  flexDirection: "column",
  padding: theme.spacing(3),
  borderRadius: "16px",
  background: (theme.vars || theme).palette.surface2.main,
  boxShadow: (theme.vars || theme).shadows[1],
  outline: "none",
  ...theme.applyStyles("light", {
    background: (theme.vars || theme).palette.surface1.main,
  }),
  [theme.breakpoints.down("sm" as Breakpoint)]: {
    width: "calc(100vw - 32px)",
  },
}));

export const LoginModalHeader = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: theme.spacing(2),
}));

export const LoginModalCloseButton = styled(IconButton)(({ theme }) => ({
  color: (theme.vars || theme).palette.text.primary,
  marginRight: theme.spacing(-1),
  marginTop: theme.spacing(-1),
}));

export const LoginPrimaryButton = styled(Button)(({ theme }) => ({
  width: "100%",
  borderRadius: "24px",
  fontWeight: 700,
  padding: theme.spacing(1.5, 0),
}));

export const LoginDivider = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1.5),
  margin: theme.spacing(2.5, 0, 1.5),
  color: (theme.vars || theme).palette.text.secondary,
  fontSize: "0.75rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  "&::before, &::after": {
    content: '""',
    flex: 1,
    height: 1,
    background: (theme.vars || theme).palette.divider,
  },
}));

export const SuiWalletButton = styled(Button)(({ theme }) => ({
  width: "100%",
  justifyContent: "flex-start",
  textTransform: "none",
  borderRadius: "12px",
  padding: theme.spacing(1, 1.5),
  gap: theme.spacing(1.5),
  color: (theme.vars || theme).palette.text.primary,
  background: (theme.vars || theme).palette.surface1.main,
  ...theme.applyStyles("light", {
    background: (theme.vars || theme).palette.surface2.main,
  }),
  "&:hover": {
    background: (theme.vars || theme).palette.action.hover,
  },
}));

export const SuiWalletIcon = styled("img")({
  width: 28,
  height: 28,
  borderRadius: 6,
  flexShrink: 0,
});

export const SuiEmptyHint = styled(Box)(({ theme }) => ({
  fontSize: "0.875rem",
  color: (theme.vars || theme).palette.text.secondary,
  padding: theme.spacing(1, 0),
}));
