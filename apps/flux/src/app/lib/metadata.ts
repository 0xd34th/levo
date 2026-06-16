import type { Metadata } from 'next';
import { JUMPER_SITE_NAME } from '@/const/domain';
import { JUMPER_URL } from '@/const/urls';

export const siteName = JUMPER_SITE_NAME;

export const pageMetadataFields = {
  default: {
    title: 'xterm.fi | Smart App for the Universal Market',
    description:
      'Move, deploy and manage your capital with xterm.fi. Fast swaps, capital deployment, and portfolio management in one smart app.',
  },
  earn: {
    title: 'xterm.fi Earn | Earn Smarter Across Chains',
    description:
      'Earn smarter across chains with xterm.fi Earn. Access DeFi earn opportunities, seamless swaps, and a consolidated portfolio view in one smart app.',
  },
  earnOpportunity: {
    title: 'xterm.fi Earn | {{opportunityName}}',
    description:
      'Earn smarter across chains with xterm.fi Earn. Access DeFi earn opportunities, seamless swaps, and a consolidated portfolio view in one smart app.',
  },
  portfolio: {
    title: 'xterm.fi Portfolio | Smarter Portfolio Overview',
    description:
      'Smarter cross-chain portfolio aggregation with xterm.fi Portfolio. Track assets in one smart app.',
  },
  profile: {
    title: 'xterm.fi Loyalty Pass',
    description:
      'xterm.fi Loyalty Pass is the page explaining the Loyalty Pass system.',
  },
};

export const pageOpenGraph: Record<string, Metadata['openGraph']> = {
  default: {
    title: pageMetadataFields.default.title,
    description: pageMetadataFields.default.description,
    images: [
      {
        url: `${JUMPER_URL}/preview-default.png`,
        width: 900,
        height: 450,
      },
    ],
    type: 'website',
    siteName,
  },
  earn: {
    title: pageMetadataFields.earn.title,
    description: pageMetadataFields.earn.description,
    images: [
      {
        url: `${JUMPER_URL}/preview-earn.png`,
        width: 900,
        height: 450,
      },
    ],
    type: 'website',
    siteName,
  },
  earnOpportunity: {
    title: pageMetadataFields.earnOpportunity.title,
    description: pageMetadataFields.earnOpportunity.description,
    images: [
      {
        url: `${JUMPER_URL}/preview-earn.png`,
        width: 900,
        height: 450,
      },
    ],
    type: 'website',
    siteName,
  },
  portfolio: {
    title: pageMetadataFields.portfolio.title,
    description: pageMetadataFields.portfolio.description,
    images: [
      {
        url: `${JUMPER_URL}/preview-portfolio.png`,
        width: 900,
        height: 450,
      },
    ],
    type: 'website',
    siteName,
  },
  profile: {
    title: pageMetadataFields.profile.title,
    description: pageMetadataFields.profile.description,
    images: [
      {
        url: `${JUMPER_URL}/preview-profile.png`,
        width: 900,
        height: 450,
      },
    ],
    type: 'website',
    siteName,
  },
};

export const pageTwitter: Record<string, Metadata['twitter']> = {
  default: {
    site: 'xterm.fi',
    title: pageMetadataFields.default.title,
    description: pageMetadataFields.default.description,
    images: `${JUMPER_URL}/preview-default.png`,
  },
  earn: {
    site: 'xterm.fi',
    title: pageMetadataFields.earn.title,
    description: pageMetadataFields.earn.description,
    images: `${JUMPER_URL}/preview-earn.png`,
  },
  earnOpportunity: {
    site: 'xterm.fi',
    title: pageMetadataFields.earnOpportunity.title,
    description: pageMetadataFields.earnOpportunity.description,
  },
  portfolio: {
    site: 'xterm.fi',
    title: pageMetadataFields.portfolio.title,
    description: pageMetadataFields.portfolio.description,
    images: `${JUMPER_URL}/preview-portfolio.png`,
  },
  profile: {
    site: 'xterm.fi',
    title: pageMetadataFields.profile.title,
    description: pageMetadataFields.profile.description,
    images: `${JUMPER_URL}/preview-profile.png`,
  },
};

export const baseMiniApp = {
  splashBackgroundColor: '#ffffff',
  iconUrl: `${JUMPER_URL}/mini-app-icon.png`,
  screenshotIcons: [
    `${JUMPER_URL}/mini-app-screenshot-1.png`,
    `${JUMPER_URL}/mini-app-screenshot-2.png`,
    `${JUMPER_URL}/mini-app-screenshot-3.png`,
  ],
  splashImageUrl: `${JUMPER_URL}/favicon.png`,
  miniAppName: 'xterm.fi',
};
