'use client';
import { widgetAllowedChainIds } from '@/config/chains';
import type { StarterVariantType } from '@/types/internal';
import { ChainId } from '@lifi/sdk';
import { HiddenUI } from '@lifi/widget';

export const themeAllowChains: ChainId[] = [...widgetAllowedChainIds];

export const defaultMainWidgetHiddenUI = [
  HiddenUI.AllNetworks,
  HiddenUI.Appearance,
  HiddenUI.Language,
  HiddenUI.PoweredBy,
  HiddenUI.WalletMenu,
  // Chain-abstracted UX: hide the widget's chain+token selector and the
  // reverse-tokens button. Asset/chain selection is driven by AssetPicker
  // + ChainChip rendered above the widget; the LI.FI widget receives
  // fromChain/fromToken/toChain/toToken via formRef.setFieldValue.
  HiddenUI.FromToken,
  HiddenUI.ToToken,
  HiddenUI.ReverseTokensButton,
  HiddenUI.ChainSelect,
];

export const ExtendedChainId = {
  HYPE: ChainId.HYP,
} as Record<string, ChainId>;

export interface WidgetProps {
  starterVariant: StarterVariantType;
  fromChain?: number;
  fromToken?: string;
  toChain?: number;
  toToken?: string;
  fromAmount?: string;
  allowChains?: number[];
  allowToChains?: number[];
  widgetIntegrator?: string;
  activeTheme?: string;
  autoHeight?: boolean;
}
