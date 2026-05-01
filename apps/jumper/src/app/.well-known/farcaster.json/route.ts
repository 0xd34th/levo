import { getMiniAppSettings } from '@/app/lib/getMiniAppSettings';
import { baseMiniApp } from '@/app/lib/metadata';
import envConfig from '@/config/env-config';

export async function GET() {
  const PUBLIC_URL = envConfig.NEXT_PUBLIC_SITE_URL as string;

  const { accountAssociation } = await getMiniAppSettings().catch((e) => {
    console.error(
      'Failed to fetch mini app settings, using default values.',
      e,
    );
    return { accountAssociation: {} };
  });

  return Response.json({
    ...accountAssociation,
    miniapp: {
      version: '1',
      name: baseMiniApp.miniAppName,
      homeUrl: PUBLIC_URL,
      iconUrl: baseMiniApp.iconUrl,
      splashImageUrl: baseMiniApp.splashImageUrl,
      splashBackgroundColor: baseMiniApp.splashBackgroundColor,
      webhookUrl: '',
      subtitle: 'Your Smart Money App',
      description: 'Move, deploy, manage capital across chains, in one place.',
      screenshotUrls: baseMiniApp.screenshotIcons,
      primaryCategory: 'finance',
      tags: ['levo', 'finance', 'swap', 'defi'],
      heroImageUrl: 'https://ex.co/og.png',
      tagline: 'Move smarter',
      ogTitle: 'Levo — Smart Money App',
      ogDescription: 'Cross-chain swap, bridge, and earn on Levo',
      ogImageUrl: 'https://ex.co/og.png',
      noindex: true,
    },
  }); // see the next step for the manifest_json_object
}
