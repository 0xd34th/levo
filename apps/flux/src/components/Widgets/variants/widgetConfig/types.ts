import type { WidgetConfig } from '@lifi/widget';
import type { StarterVariantType } from 'src/types/internal';
import type {
  TaskWidgetInformationChainData,
  TaskWidgetInformationTokenData,
  TaskWidgetInformationWalletData,
} from 'src/types/strapi';
import type { WidgetThemeConfig } from 'src/types/theme';
import type { PartnerThemeConfig } from 'src/types/PartnerThemeConfig';
import type { TFunction, i18n } from 'i18next';
import type { Theme as MuiTheme } from '@mui/material/styles';

export type EnglishLanguageResource = NonNullable<
  WidgetConfig['languageResources']
>['en'];

// Hook dependencies interface
export interface HookDependencies {
  translation: {
    i18n: i18n;
    t: TFunction<'translation', undefined>;
  };
  theme: {
    widgetTheme: WidgetThemeConfig;
    configTheme: Partial<PartnerThemeConfig>;
    muiTheme: MuiTheme;
  };
  wallet: {
    openWalletMenu: () => void;
  };
}

// Form data interface
export interface FormData {
  sourceChain?: TaskWidgetInformationChainData;
  sourceToken?: TaskWidgetInformationTokenData;
  destinationChain?: TaskWidgetInformationChainData;
  destinationToken?: TaskWidgetInformationTokenData;
  fromAmount?: string;
  toAddress?: TaskWidgetInformationWalletData;
  minFromAmountUSD?: number;
}

export interface CommonWidgetContext {
  integrator?: string;
  keyPrefix?: string;
  variant?: WidgetConfig['variant'];
  formData?: FormData;
  allowChains?: number[];
  allowFromChains?: number[];
  allowToChains?: number[];
  theme?: WidgetConfig['theme'];
  disabledUI?: WidgetConfig['disabledUI'];
  hiddenUI?: WidgetConfig['hiddenUI'];
}

export interface MainWidgetContext extends CommonWidgetContext {
  starterVariant: StarterVariantType;
  partnerName: string;
  bridgeConditions?: {
    isAGWToNonABSChain?: boolean;
    isBridgeFromHypeToArbNativeUSDC?: boolean;
    isBridgeFromEvmToHype?: boolean;
    isPrivateSwapSelected?: boolean;
    toAddress?: string;
  };
  isConnectedAGW?: boolean;
}

export type WidgetContext = MainWidgetContext;
