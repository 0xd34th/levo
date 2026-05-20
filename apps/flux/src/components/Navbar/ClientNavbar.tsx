'use client';

import { AppPaths } from '@/const/urls';
import { useWelcomeScreen } from '@/hooks/useWelcomeScreen';
import { useMenuStore } from '@/stores/menu';
import { useThemeStore } from 'src/stores/theme';
import { LogoLinkWrapper, NavbarContainer } from './Navbar.style';
import { Logo } from './components/Logo/Logo';
import { Layout } from './layout/Layout';
import { HideOnScroll } from '../core/HideOnScroll/HideOnScroll';

export const ClientNavbar = () => {
  const { setWelcomeScreenClosed } = useWelcomeScreen();
  const configTheme = useThemeStore((state) => state.configTheme);

  const { closeAllMenus } = useMenuStore((state) => state);
  const handleClick = () => {
    closeAllMenus();
    setWelcomeScreenClosed(false);
  };

  return (
    <HideOnScroll>
      <NavbarContainer
        enableColorOnDark
        hasBlurredNavigation={configTheme?.hasBlurredNavigation}
      >
        <LogoLinkWrapper
          href={AppPaths.Main}
          id="jumper-logo"
          onClick={handleClick}
        >
          <Logo />
        </LogoLinkWrapper>
        <Layout />
      </NavbarContainer>
    </HideOnScroll>
  );
};
