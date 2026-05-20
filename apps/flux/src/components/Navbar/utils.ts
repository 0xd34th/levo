import { AppPaths } from '@/const/urls';

export const checkIsPrivacyPolicyPage = (pathname: string) => {
  return pathname.includes(AppPaths.PrivacyPolicy);
};
