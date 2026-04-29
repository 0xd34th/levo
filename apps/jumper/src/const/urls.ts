import config from '@/config/env-config';

export const JUMPER_URL = 'https://jumper.xyz';
export const JUMPER_STRAPI_URL = 'https://strapi.jumper.xyz';
export const DISCORD_URL = 'https://discord.gg/jumperexchange';
export const DISCORD_URL_INVITE = 'https://discord.com/invite/jumperexchange';
export const X_URL = 'https://x.com/jumperapp';
export const GITHUB_URL = 'https://github.com/jumperexchange';
export const X_SHARE_URL = 'https://x.com/share';
export const FB_SHARE_URL = 'https://www.facebook.com/sharer/sharer.php';
export const LINKEDIN_SHARE_URL = 'https://www.linkedin.com/shareArticle';
export const LINK3_URL = 'https://link3.to/jumperexchange';
export const TELEGRAM_URL = 'https://t.me/jumperapp';
export const GATEKEEPER_REQUEST_ACCESS_URL = 'https://tally.so/r/VLGZOJ';
export const TERMS_CONDITIONS_URL = 'https://li.fi/legal/terms-and-conditions';
export const JUMPER_MAIN_PATH = '/';
export const JUMPER_BRIDGE_PATH = '/bridge';
export const JUMPER_SWAP_PATH = '/swap';
export const JUMPER_TX_PATH = '/tx';
export const JUMPER_WALLET_PATH = '/wallet';
export const JUMPER_PRIVACY_POLICY_PATH = '/privacy-policy';
export const JUMPER_TERMS_OF_BUSINESS_PATH = '/terms-of-business';

export const JUMPER_BRIDGE_PATH_SOURCE_DESTINATION_DELIMITER = 'to';
export const JUMPER_BRIDGE_PATH_DELIMITER = '-';
export const JUMPER_BRIDGE_PATH_SOURCE_DESTINATION_FULL_DELIMITER = `${JUMPER_BRIDGE_PATH_DELIMITER}${JUMPER_BRIDGE_PATH_SOURCE_DESTINATION_DELIMITER}${JUMPER_BRIDGE_PATH_DELIMITER}`;

export const DEFAULT_WALLET_ADDRESS =
  '0x0000000000000000000000000000000000000000';

export function getSiteUrl() {
  return config.NEXT_PUBLIC_VERCEL_BRANCH_URL
    ? `https://${config.NEXT_PUBLIC_VERCEL_BRANCH_URL}`
    : config.NEXT_PUBLIC_SITE_URL || '';
}

export enum AppPaths {
  Main = JUMPER_MAIN_PATH,
  Bridge = JUMPER_BRIDGE_PATH,
  Swap = JUMPER_SWAP_PATH,
  Tx = JUMPER_TX_PATH,
  Wallet = JUMPER_WALLET_PATH,
  PrivacyPolicy = JUMPER_PRIVACY_POLICY_PATH,
  TermsOfBusiness = JUMPER_TERMS_OF_BUSINESS_PATH,
}
