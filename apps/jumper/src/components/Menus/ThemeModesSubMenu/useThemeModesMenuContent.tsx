import { useColorScheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import FlareRoundedIcon from '@mui/icons-material/FlareRounded';
import { useMemo, useCallback, useEffect } from 'react';
import type { Appearance } from '@lifi/widget';
import type { PartnerThemesData } from '@/types/strapi';
import { useUserTracking } from '@/hooks/userTracking/useUserTracking';
import { useThemeStore } from '@/stores/theme';
import {
  TrackingAction,
  TrackingCategory,
  TrackingEventParameter,
} from '@/const/trackingKeys';
import Avatar from '@mui/material/Avatar';
import { selectAvailablePartnerThemes } from '@/stores/theme/createThemeStore';

interface SubmenuItem {
  label: string;
  prefixIcon: React.JSX.Element;
  checkIcon: boolean;
  onClick: () => void;
  disabled: boolean;
}

const MODE_OPTIONS = {
  light: {
    icon: <WbSunnyOutlinedIcon />,
    translationKey: 'navbar.themes.light',
  },
} as const;

const LIGHT_MODE = 'light' as const satisfies Appearance;
const STANDARD_MODES = [LIGHT_MODE] as const;

export const useThemeModesMenuContent = () => {
  const { mode, setMode } = useColorScheme();
  const { t } = useTranslation();
  const { trackEvent } = useUserTracking();

  const [setConfigThemeState, configThemeStates] = useThemeStore((state) => [
    state.setConfigThemeState,
    state.configThemeStates,
  ]);
  const availablePartnerThemes = useThemeStore(selectAvailablePartnerThemes);

  const selectedThemeMode = LIGHT_MODE;

  const { activeConfigThemeUid, activeConfigTheme } = useMemo(() => {
    for (const [uid, state] of Object.entries(configThemeStates)) {
      if (state.isSelected) {
        const theme = availablePartnerThemes.find((t) => t.uid === uid);
        return { activeConfigThemeUid: uid, activeConfigTheme: theme };
      }
    }
    return { activeConfigThemeUid: undefined, activeConfigTheme: undefined };
  }, [configThemeStates, availablePartnerThemes]);

  useEffect(() => {
    if (!activeConfigTheme) {
      if (activeConfigThemeUid) {
        setMode(LIGHT_MODE);
        console.debug('Changed theme mode to: light');
        setConfigThemeState(activeConfigThemeUid, { isSelected: false });
      }
      return;
    }

    if (mode !== LIGHT_MODE) {
      setMode(LIGHT_MODE);
      console.debug('Changed theme mode to: light');
    }
  }, [
    activeConfigThemeUid,
    activeConfigTheme,
    mode,
    setMode,
    setConfigThemeState,
  ]);

  const clearPartnerTheme = useCallback(() => {
    if (activeConfigThemeUid) {
      setConfigThemeState(activeConfigThemeUid, { isSelected: false });
    }
  }, [activeConfigThemeUid, setConfigThemeState]);

  const handleSwitchMode = useCallback(
    (newMode: Appearance) => {
      const nextMode = LIGHT_MODE;
      trackEvent({
        category: TrackingCategory.ThemeSection,
        action: TrackingAction.SwitchTheme,
        label: `theme_${nextMode}`,
        data: { [TrackingEventParameter.SwitchedTheme]: nextMode },
      });
      void newMode;
      clearPartnerTheme();
      setMode(nextMode);
      console.debug(`Changing theme mode to: ${nextMode}`);
    },
    [trackEvent, setMode, clearPartnerTheme],
  );

  const handleSwitchTheme = useCallback(
    (theme: PartnerThemesData) => {
      trackEvent({
        category: TrackingCategory.ThemeSection,
        action: TrackingAction.SwitchThemeTemplate,
        label: `theme_${theme.uid}`,
        data: { [TrackingEventParameter.SwitchedTemplate]: theme.uid },
      });
      clearPartnerTheme();
      setConfigThemeState(theme.uid, { isSelected: true });
      setMode(LIGHT_MODE);
      console.debug(`Changing theme mode to: ${LIGHT_MODE}`);
    },
    [trackEvent, setConfigThemeState, setMode, clearPartnerTheme],
  );

  const displayablePartnerThemes = useMemo(
    () =>
      availablePartnerThemes.filter(
        (t) => t.SelectableInMenu && t.PartnerName && t.lightConfig,
      ),
    [availablePartnerThemes],
  );

  const standardModeItems = useMemo<SubmenuItem[]>(
    () =>
      STANDARD_MODES.map((themeMode) => ({
        label: t(MODE_OPTIONS[themeMode].translationKey),
        prefixIcon: MODE_OPTIONS[themeMode].icon,
        checkIcon: !activeConfigThemeUid,
        onClick: () => handleSwitchMode(themeMode),
        disabled: false,
      })),
    [t, activeConfigThemeUid, handleSwitchMode],
  );

  const partnerThemeItems = useMemo<SubmenuItem[]>(
    () =>
      displayablePartnerThemes.map((theme) => {
        const themeModeIcon = (theme.lightConfig || theme.darkConfig)
          ?.customization?.themeModeIcon;
        return {
          label: theme.PartnerName,
          prefixIcon: themeModeIcon ? (
            <Avatar
              src={themeModeIcon}
              alt={theme.PartnerName}
              sx={{
                height: 24,
                width: 24,
                filter: 'grayscale(100%) contrast(2)',
              }}
            />
          ) : (
            <FlareRoundedIcon />
          ),
          checkIcon: activeConfigThemeUid === theme.uid,
          onClick: () => handleSwitchTheme(theme),
          disabled: false,
        };
      }),
    [displayablePartnerThemes, activeConfigThemeUid, handleSwitchTheme],
  );

  const selectedPartnerThemeItem = useMemo(
    () => partnerThemeItems.find((t) => t.checkIcon),
    [partnerThemeItems],
  );

  return {
    selectedThemeMode,
    selectedPartnerTheme: selectedPartnerThemeItem?.label,
    selectedThemeIcon:
      selectedPartnerThemeItem?.prefixIcon ??
      MODE_OPTIONS[selectedThemeMode].icon,
    submenuItems: [...standardModeItems, ...partnerThemeItems],
  };
};
