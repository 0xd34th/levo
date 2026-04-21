import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { PropsWithChildren } from 'react';
import { getPartnerThemes } from 'src/app/lib/getPartnerThemes';
import { Layout } from 'src/Layout';

const PARTNER_THEME = 'soneium';

export const metadata: Metadata = {
  other: {
    'partner-theme': PARTNER_THEME,
  },
};

export default async function InfosLayout({ children }: PropsWithChildren) {
  // Degrade to a 404 when the CMS read fails so a Strapi outage (or a fork
  // deployment without this theme configured) does not abort the whole
  // prerender. This mirrors the optional-read pattern in `[lng]/layout.tsx`.
  const partnerThemes = await getPartnerThemes().catch(() => ({ data: [] }));

  const partnerThemesData = partnerThemes.data?.find(
    (d) => d?.uid === PARTNER_THEME,
  );

  if (!partnerThemesData) {
    return notFound();
  }
  return <Layout>{children}</Layout>;
}
