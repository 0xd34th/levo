import { STRAPI_PARTNER_THEMES } from '@/const/strapiContentKeys';
import { getStrapiUrl } from '@/hooks/useStrapi';
import type { PartnerThemeConfig } from '@/types/PartnerThemeConfig';
import type { PartnerThemesAttributes } from '@/types/strapi';

function getImageUrl(
  theme: PartnerThemesAttributes,
  imageType: 'BackgroundImage' | 'FooterImage' | 'Logo',
  defaultMode: 'light' | 'dark' = 'light',
): URL | null {
  const baseStrapiUrl = getStrapiUrl(STRAPI_PARTNER_THEMES);

  const imageLight = theme[`${imageType}Light`];
  const imageDark = theme[`${imageType}Dark`];
  const imageUrl = defaultMode === 'light' ? imageLight?.url : imageDark?.url;

  return imageUrl ? new URL(imageUrl, baseStrapiUrl) : null;
}

export function getAvailableThemeModes(
  theme?: PartnerThemesAttributes,
): string[] {
  const result: string[] = [];

  // Means it is default jumper theme
  if (!theme) {
    return ['light'];
  }

  if (theme.lightConfig) {
    result.push('light');
  }

  return result;
}

export function getLogoData(theme: PartnerThemesAttributes) {
  const baseStrapiUrl = getStrapiUrl(STRAPI_PARTNER_THEMES);
  const logo = theme.LogoDark || theme.LogoLight || null;

  if (!logo) {
    return;
  }

  const attr = logo;

  return {
    url: new URL(attr.url, baseStrapiUrl),
    width: attr.width,
    height: attr.height,
  };
}

export function formatConfig(
  theme?: PartnerThemesAttributes,
): Partial<PartnerThemeConfig> {
  if (!theme) {
    return {
      uid: 'default',
      availableThemeModes: getAvailableThemeModes(),
      hasThemeModeSwitch: true,
      hasBackgroundGradient: true,
    };
  }

  const defaultMode = isDarkOrLightThemeMode(theme);
  const themeModes = getAvailableThemeModes(theme);
  const result = {
    availableThemeModes: themeModes,
    backgroundColor:
      theme.BackgroundColorLight || null,
    backgroundImageUrl: getImageUrl(theme, 'BackgroundImage', defaultMode),
    backgroundImagePosition:
      theme.lightConfig?.customization?.backgroundImagePosition || 'center',
    footerImageUrl: getImageUrl(theme, 'FooterImage', defaultMode),
    logo: getLogoData(theme),
    partnerName: theme.PartnerName,
    partnerUrl: theme.PartnerURL,
    selectableInMenu: theme.SelectableInMenu || false,
    createdAt: theme.createdAt,
    publishedAt: theme.publishedAt,
    uid: theme.uid,
    themeModeIcon: theme.lightConfig?.customization?.themeModeIcon,
    defaultThemeMode:
      (theme.lightConfig?.config?.appearance as 'light' | 'dark') ?? 'light',
    hasThemeModeSwitch: theme.lightConfig?.customization
      ?.hasThemeModeSwitch ?? true,
    hasBlurredNavigation:
      theme.lightConfig?.customization?.hasBlurredNavigation ?? false,
    hasBackgroundGradient:
      theme.lightConfig?.customization?.hasBackgroundGradient ?? false,
    integrator: theme.lightConfig?.config?.integrator ?? undefined,
    fromChain: theme.lightConfig?.config?.fromChain ?? undefined,
    toChain: theme.lightConfig?.config?.toChain ?? undefined,
    toToken: theme.lightConfig?.config?.toToken ?? undefined,
    fromToken: theme.lightConfig?.config?.fromToken ?? undefined,
    hiddenUI: theme.lightConfig?.config?.hiddenUI ?? undefined,
    variant: theme.lightConfig?.config?.variant ?? undefined,
    chains: theme.lightConfig?.config?.chains ?? undefined,
    allowedBridges: theme.Bridges?.map((i) => i.key),
    allowedExchanges: theme.Exchanges?.map((i) => i.key),
  };

  return result;
}

export function formatTheme(theme: PartnerThemesAttributes) {
  const config = formatConfig(theme);
  const themeConfig = theme.lightConfig;

  // Jumper theme options (for createJumperTheme)
  const jumperTheme = themeConfig?.jumperTheme ?? {};

  // Background component overrides
  const backgroundComponent = {
    Background: {
      styleOverrides: {
        root: {
          position: 'fixed',
          left: 0,
          bottom: 0,
          right: 0,
          top: 0,
          zIndex: -1,
          overflow: 'hidden',
          pointerEvents: 'none',
          ...(config.backgroundColor && {
            backgroundColor: config.backgroundColor,
          }),
          // @Note we use the animated background image component instead of the background image url
          // ...(config.backgroundImageUrl && {
          //   background: `url('${config.backgroundImageUrl}') ${config.backgroundColor ?? ''} no-repeat center center / cover`,
          // }),
        },
      },
    },
  };

  // Merge jumperTheme components with Background override
  const formattedJumperTheme = {
    ...jumperTheme,
    components: {
      ...jumperTheme.components,
      ...backgroundComponent,
    },
  };

  const formattedWidgetTheme = themeConfig?.config ?? {};

  return {
    config,
    jumperTheme: formattedJumperTheme,
    activeWidgetTheme: formattedWidgetTheme,
    themeName: theme.uid,
    /** @deprecated Use jumperTheme instead */
    activeMUITheme: formattedJumperTheme,
  };
}

export const isDarkOrLightThemeMode = (
  _theme: PartnerThemesAttributes,
): 'light' | 'dark' => 'light';
