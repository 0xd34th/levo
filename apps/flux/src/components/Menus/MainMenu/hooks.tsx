import { useMemo, useCallback } from 'react';
import { Discord } from '@/components/illustrations/Discord';
import { Telegram } from '@/components/illustrations/Telegram';
import { X } from '@/components/illustrations/X';
import { Link3Icon } from '@/components/illustrations/Link3Icon';
import { MenuKeysEnum } from '@/const/menuKeys';
import {
  TrackingAction,
  TrackingCategory,
  TrackingEventParameter,
} from '@/const/trackingKeys';
import { AppPaths, DISCORD_URL, LINK3_URL, TELEGRAM_URL, X_URL } from '@/const/urls';
import { useUserTracking } from '@/hooks/userTracking/useUserTracking';
import { useMenuStore } from '@/stores/menu';
import { useThemeStore } from '@/stores/theme';
import FolderOpen from '@mui/icons-material/FolderOpen';
import LanguageIcon from '@mui/icons-material/Language';
import SupportRoundedIcon from '@mui/icons-material/SupportRounded';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { useThemeModesMenuContent } from '../ThemeModesSubMenu/useThemeModesMenuContent';
import type { MenuItemProps } from 'src/components/Menu/MenuItem/MenuItem.types';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Badge } from '@/components/Badge/Badge';
import { BadgeVariant } from '@/components/Badge/Badge.styles';
import * as supportedLanguages from '@/i18n/translations';
import MuiBadge from '@mui/material/Badge';

interface MenuLink {
  url: string;
  external?: boolean;
}

interface MenuItem extends Omit<MenuItemProps, 'open'> {}

const enum SocialLinkLabel {
  TELEGRAM = 'Telegram',
  DISCORD = 'Discord',
  LINK3 = 'Link3',
  X = 'X',
}

export interface SocialLink {
  label: string;
  prefixIcon: React.JSX.Element | string;
  link: MenuLink;
  onClick: () => void;
}

export interface FooterLink {
  label: string;
  link: MenuLink;
  onClick: () => void;
  external?: boolean;
}

interface TrackPageloadParams {
  destination: string;
  url: string;
  source?: TrackingCategory;
}

interface TrackMenuClickParams {
  label: string;
  action: TrackingAction;
  dataMenuParam: string;
}

export const useMenuTracking = () => {
  const { trackEvent } = useUserTracking();

  const trackPageLoad = useCallback(
    ({
      destination,
      url,
      source = TrackingCategory.Menu,
    }: TrackPageloadParams) => {
      trackEvent({
        category: TrackingCategory.Pageload,
        action: TrackingAction.PageLoad,
        label: `pageload-${destination}`,
        data: {
          [TrackingEventParameter.PageloadSource]: source,
          [TrackingEventParameter.PageloadDestination]: destination,
          [TrackingEventParameter.PageloadURL]: url,
          [TrackingEventParameter.PageloadExternal]: true,
        },
      });
    },
    [trackEvent],
  );

  const trackMenuClick = useCallback(
    ({ label, action, dataMenuParam }: TrackMenuClickParams) => {
      trackEvent({
        category: TrackingCategory.Menu,
        label,
        action,
        data: { [TrackingEventParameter.Menu]: dataMenuParam },
      });
    },
    [trackEvent],
  );

  return { trackPageLoad, trackMenuClick };
};

export const useMenuActions = () => {
  const { trackEvent } = useUserTracking();
  const { trackMenuClick } = useMenuTracking();
  const { setSupportModalState, setSubMenuState, closeAllMenus } = useMenuStore(
    (state) => state,
  );

  const handleExchangeClick = useCallback(() => {
    trackMenuClick({
      label: 'click-jumper-exchange-link',
      action: TrackingAction.ClickJumperExchangeLink,
      dataMenuParam: 'jumper_exchange',
    });
    closeAllMenus();
  }, [trackMenuClick, closeAllMenus]);

  const handleSupportClick = useCallback(() => {
    setSupportModalState(true);
  }, [setSupportModalState]);

  const handleThemeClick = useCallback(() => {
    setSubMenuState(MenuKeysEnum.ThemeMode);
  }, [setSubMenuState]);

  const handleLanguageClick = useCallback(() => {
    setSubMenuState(MenuKeysEnum.Language);
  }, [setSubMenuState]);

  const handleResourcesClick = useCallback(() => {
    setSubMenuState(MenuKeysEnum.Devs);
    trackEvent({
      category: TrackingCategory.MainMenu,
      action: TrackingAction.OpenMenu,
      label: `open_submenu_${MenuKeysEnum.Devs.toLowerCase()}`,
      data: { [TrackingEventParameter.Menu]: MenuKeysEnum.Devs },
    });
  }, [setSubMenuState, trackEvent]);

  const handlePrivacyPolicyClick = useCallback(() => {
    trackMenuClick({
      label: 'click-jumper-privacy-policy-link',
      action: TrackingAction.ClickJumperPrivacyPolicyLink,
      dataMenuParam: 'jumper_privacy_policy',
    });
    closeAllMenus();
  }, [trackMenuClick, closeAllMenus]);

  const handleTermsConditionsClick = useCallback(() => {
    trackMenuClick({
      label: 'click-jumper-terms-conditions-link',
      action: TrackingAction.ClickJumperTermsConditionsLink,
      dataMenuParam: 'jumper_terms_conditions',
    });
    closeAllMenus();
  }, [trackMenuClick, closeAllMenus]);

  return {
    handleExchangeClick,
    handleSupportClick,
    handleThemeClick,
    handleLanguageClick,
    handleResourcesClick,
    handlePrivacyPolicyClick,
    handleTermsConditionsClick,
  };
};

export const useSocialLinks = () => {
  const theme = useTheme();
  const { trackMenuClick, trackPageLoad } = useMenuTracking();

  const socialLinkIconStyle = useMemo(
    () => ({
      color: (theme.vars || theme).palette.alphaLight600.main,
      ...theme.applyStyles('light', {
        color: (theme.vars || theme).palette.alphaDark500.main,
      }),
    }),
    [theme],
  );

  const createSocialLink = useCallback(
    ({
      label,
      icon,
      url,
      trackingKey,
      action,
    }: {
      label: string;
      icon: React.JSX.Element | string;
      url: string;
      trackingKey: string;
      action: TrackingAction;
    }): SocialLink => ({
      label,
      prefixIcon: icon,
      link: { url, external: true },
      onClick: () => {
        trackMenuClick({
          label: `click-${trackingKey}-link`,
          dataMenuParam: `${trackingKey}-jumper`,
          action,
        });
        trackPageLoad({
          destination: `${trackingKey}_jumper`,
          url,
          source: TrackingCategory.MainMenu,
        });
      },
    }),
    [trackMenuClick, trackPageLoad],
  );

  const socialLinks: SocialLink[] = useMemo(
    () => [
      createSocialLink({
        label: SocialLinkLabel.X,
        icon: <X sx={socialLinkIconStyle} />,
        url: X_URL,
        trackingKey: SocialLinkLabel.X.toLowerCase(),
        action: TrackingAction.ClickXLink,
      }),
      createSocialLink({
        label: SocialLinkLabel.DISCORD,
        icon: <Discord sx={socialLinkIconStyle} />,
        url: DISCORD_URL,
        trackingKey: SocialLinkLabel.DISCORD.toLowerCase(),
        action: TrackingAction.ClickDiscordLink,
      }),
      createSocialLink({
        label: SocialLinkLabel.TELEGRAM,
        icon: <Telegram sx={socialLinkIconStyle} />,
        url: TELEGRAM_URL,
        trackingKey: SocialLinkLabel.TELEGRAM.toLowerCase(),
        action: TrackingAction.ClickTelegramLink,
      }),
      createSocialLink({
        label: SocialLinkLabel.LINK3,
        icon: <Link3Icon sx={socialLinkIconStyle} />,
        url: LINK3_URL,
        trackingKey: SocialLinkLabel.LINK3.toLowerCase(),
        action: TrackingAction.ClickLink3Link,
      }),
    ],
    [createSocialLink, socialLinkIconStyle],
  );

  return { socialLinks };
};

export const useFooterLinks = () => {
  const { t } = useTranslation();
  const { handlePrivacyPolicyClick, handleTermsConditionsClick } =
    useMenuActions();

  const footerLinks = useMemo<FooterLink[]>(
    () => [
      {
        label: t('navbar.navbarMenu.termsOfBusiness'),
        link: { url: AppPaths.TermsOfBusiness },
        onClick: handleTermsConditionsClick,
      },
      {
        label: t('navbar.navbarMenu.privacyPolicy'),
        link: { url: AppPaths.PrivacyPolicy },
        onClick: handlePrivacyPolicyClick,
      },
    ],
    [t, handlePrivacyPolicyClick, handleTermsConditionsClick],
  );

  return { footerLinks };
};

export const useMenuItems = () => {
  const { t, i18n } = useTranslation();
  const isTablet = useMediaQuery((theme) => theme.breakpoints.down('lg'));
  const [configTheme] = useThemeStore((state) => [state.configTheme]);
  const { selectedThemeIcon, selectedThemeMode, selectedPartnerTheme } =
    useThemeModesMenuContent();
  const { supportModalUnreadCount } = useMenuStore((state) => state);

  const {
    handleSupportClick,
    handleThemeClick,
    handleLanguageClick,
    handleResourcesClick,
    handleExchangeClick,
  } = useMenuActions();

  const themeSuffixIcon = useMemo(() => {
    if (!isTablet) {
      return undefined;
    }

    return (
      <Badge
        label={selectedPartnerTheme ?? t(`navbar.themes.${selectedThemeMode}`)}
        variant={BadgeVariant.Secondary}
      />
    );
  }, [t, selectedThemeMode, selectedPartnerTheme, isTablet]);

  const languageSuffixIcon = useMemo(() => {
    if (!isTablet) {
      return (
        <Typography
          variant="bodyMedium"
          sx={{
            textTransform: 'uppercase',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 38,
          }}
        >
          {i18n.language}
        </Typography>
      );
    }

    const selectedLanguage =
      Object.entries(supportedLanguages).find(
        ([language]) => language === i18n.language,
      )?.[1]?.language?.value || i18n.language;

    return <Badge label={selectedLanguage} variant={BadgeVariant.Secondary} />;
  }, [i18n.language, isTablet]);

  const baseMenuItems: MenuItem[] = useMemo(() => {
    const baseItems: MenuItem[] = [];

    if (isTablet) {
      baseItems.push({
        label: t('navbar.links.exchange'),
        showMoreIcon: false,
        link: { url: AppPaths.Main },
        onClick: handleExchangeClick,
      });

      baseItems.push({
        isDivider: true,
      });
    }

    baseItems.push({
      label: t('navbar.navbarMenu.support'),
      prefixIcon: !isTablet ? (
        supportModalUnreadCount > 0 ? (
          <MuiBadge
            color="secondary"
            variant="dot"
            sx={(theme) => ({
              '.MuiBadge-badge': {
                backgroundColor: (theme.vars || theme).palette.borderActive,
                mt: 0.5,
                mr: 0.25,
              },
            })}
          >
            <SupportRoundedIcon />
          </MuiBadge>
        ) : (
          <SupportRoundedIcon />
        )
      ) : undefined,
      showMoreIcon: false,
      onClick: handleSupportClick,
    });

    if (isTablet) {
      baseItems.push({
        isDivider: true,
      });
    }

    if (configTheme?.hasThemeModeSwitch) {
      baseItems.push({
        label: t('navbar.navbarMenu.theme'),
        prefixIcon: !isTablet ? selectedThemeIcon : undefined,
        showMoreIcon: true,
        triggerSubMenu: MenuKeysEnum.ThemeMode,
        suffixIcon: themeSuffixIcon,
        onClick: handleThemeClick,
      });
    }

    baseItems.push(
      {
        label: t('language.key', { ns: 'language' }),
        prefixIcon: !isTablet ? <LanguageIcon /> : undefined,
        showMoreIcon: true,
        triggerSubMenu: MenuKeysEnum.Language,
        suffixIcon: languageSuffixIcon,
        onClick: handleLanguageClick,
      },
      {
        label: t('navbar.navbarMenu.resources'),
        prefixIcon: !isTablet ? <FolderOpen /> : undefined,
        showMoreIcon: true,
        triggerSubMenu: MenuKeysEnum.Devs,
        onClick: handleResourcesClick,
      },
    );

    return baseItems;
  }, [
    t,
    isTablet,
    configTheme?.hasThemeModeSwitch,
    selectedThemeIcon,
    themeSuffixIcon,
    languageSuffixIcon,
    supportModalUnreadCount,
    handleSupportClick,
    handleThemeClick,
    handleLanguageClick,
    handleResourcesClick,
    handleExchangeClick,
  ]);

  return { menuItems: baseMenuItems };
};

export const useMainMenuContent = () => {
  const { menuItems } = useMenuItems();
  const { socialLinks } = useSocialLinks();
  const { footerLinks } = useFooterLinks();

  return {
    mainMenuItems: menuItems,
    mainMenuSocialLinks: socialLinks,
    mainMenuFooterLinks: footerLinks,
  };
};
