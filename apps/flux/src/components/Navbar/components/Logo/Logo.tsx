'use client';
import { LogoWrapper } from '@/components/illustrations/Logo.style';
import { useThemeStore } from '@/stores/theme';
import ClearIcon from '@mui/icons-material/Clear';
import type { Theme } from '@mui/material';
import { useMediaQuery } from '@mui/material';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';

const JumperLogo = dynamic(() =>
  import('@/components/illustrations/JumperLogo').then((m) => m.JumperLogo),
);

export const Logo = () => {
  const configTheme = useThemeStore((state) => state.configTheme);

  const isMobile = useMediaQuery(
    (theme: Theme) => theme.breakpoints.down('md'),
    {
      noSsr: true,
    },
  );

  const partnerLogo = useMemo(() => {
    if (isMobile || !configTheme?.logo?.url) {
      return null;
    }

    return (
      <>
        <ClearIcon
          sx={(theme) => ({
            color: theme.palette.grey[500],
            width: '16px',
            height: '16px',
            marginLeft: theme.spacing(-2),
            marginRight: theme.spacing(2),
            alignSelf: 'center',
            ...theme.applyStyles('light', {
              color: theme.palette.black.main,
            }),
          })}
        />
        <Image
          alt="jumper-partner-logo"
          src={configTheme.logo.url.href}
          width={configTheme.logo.width ?? 120}
          height={configTheme.logo.height ?? 32}
          style={{ width: 'auto', height: 'auto' }}
          priority
        />
      </>
    );
  }, [isMobile, configTheme?.logo]);

  return (
    <LogoWrapper>
      <JumperLogo />
      {partnerLogo}
    </LogoWrapper>
  );
};
