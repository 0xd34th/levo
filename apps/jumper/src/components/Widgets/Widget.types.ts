'use client';
import type { StarterVariantType } from '@/types/internal';
import { ChainId } from '@lifi/sdk';

export const themeAllowChains: ChainId[] = [
  ChainId.ETH,
  ChainId.BAS,
  ChainId.OPT,
  ChainId.ARB,
  ChainId.AVA,
  ChainId.BSC,
];

export const ExtendedChainId = {
  HYPE: 998 as ChainId,
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
