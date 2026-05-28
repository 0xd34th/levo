'use client';
import { CustomColor } from '@/components/CustomColorTypography.style';
import { TrackingAction, TrackingCategory } from '@/const/trackingKeys';
import { useWelcomeScreen } from '@/hooks/useWelcomeScreen';
import { useUserTracking } from '@/hooks/userTracking/useUserTracking';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Trans } from 'react-i18next';
import { JUMPER_URL } from 'src/const/urls';
import { ToolCards } from './ToolCard/ToolCards';
import {
  ContentWrapper,
  WelcomeContent,
  WelcomeScreenSubtitle,
} from './WelcomeScreen.style';
import { Link } from '../Link/Link';

interface WelcomeScreenProps {
  activeTheme?: string;
}

export const WelcomeScreen = ({ activeTheme }: WelcomeScreenProps) => {
  const { welcomeScreenClosed, setWelcomeScreenClosed } = useWelcomeScreen();

  const { t } = useTranslation();
  const { trackEvent } = useUserTracking();

  useEffect(() => {
    if (welcomeScreenClosed) {
      trackEvent({
        category: TrackingCategory.WelcomeScreen,
        label: 'open-welcome-screen',
        action: TrackingAction.ShowWelcomeMessageScreen,
      });
    }
  }, [trackEvent, welcomeScreenClosed]);

  const handleTaskSelect = (task: { id: string }) => {
    if (!welcomeScreenClosed) {
      setWelcomeScreenClosed(true);
      trackEvent({
        category: TrackingCategory.WelcomeScreen,
        action: TrackingAction.CloseWelcomeScreen,
        label: `enter_welcome_screen_${task.id}`,
        enableAddressable: true,
      });
    }
  };

  return (
    <ContentWrapper>
      <WelcomeContent>
        <CustomColor variant="h1">{t('navbar.welcome.title')}</CustomColor>
        <WelcomeScreenSubtitle variant={'bodyLarge'}>
          <Trans
            i18nKey={'navbar.welcome.subtitle'}
            components={[
              <Link
                href={JUMPER_URL}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ fontWeight: 'bold' }}
                className={'link-jumper'}
              />,
            ]}
          />
        </WelcomeScreenSubtitle>
        <ToolCards onTaskSelect={handleTaskSelect} />
      </WelcomeContent>
    </ContentWrapper>
  );
};
