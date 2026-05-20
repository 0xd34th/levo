import { ChainId } from '@lifi/sdk';
import { HiddenUI } from '@lifi/widget';
import { describe, expect, it } from 'vitest';
import { filterAllowedWidgetChainIds } from '@/config/chains';
import { defaultMainWidgetHiddenUI, themeAllowChains } from './Widget.types';

describe('themeAllowChains', () => {
  it('limits the Jumper widget to the supported production chain set', () => {
    expect(themeAllowChains).toEqual([
      ChainId.SOL,
      ChainId.BAS,
      ChainId.MON,
      ChainId.SUI,
      ChainId.ETH,
      ChainId.ARB,
      ChainId.HPL,
      ChainId.HYP,
      ChainId.BSC,
      ChainId.OPT,
      ChainId.POL,
    ]);
    expect(new Set(themeAllowChains).size).toBe(themeAllowChains.length);
  });

  it('prevents caller-provided chain lists from expanding the supported set', () => {
    expect(
      filterAllowedWidgetChainIds([
        ChainId.AVA,
        ChainId.ABS,
        ChainId.SUI,
        ChainId.HYP,
      ]),
    ).toEqual([ChainId.SUI, ChainId.HYP]);
  });

  it('hides All Networks in the default exchange widget UI', () => {
    expect(defaultMainWidgetHiddenUI).toContain(HiddenUI.AllNetworks);
  });
});
