import {
  JUMPER_BRIDGE_PATH,
  JUMPER_SWAP_PATH,
} from '@/const/urls';
import { usePathname } from 'next/navigation';

interface useMainPathsProps {
  isMainPaths: boolean;
}

export const useMainPaths = (): useMainPathsProps => {
  const pathname = usePathname();

  const isExchange =
    !pathname?.includes(JUMPER_SWAP_PATH) &&
    !pathname?.includes(JUMPER_BRIDGE_PATH) &&
    (pathname === '/' ||
      pathname?.split('/').length === 3 ||
      pathname?.split('/').length === 2);

  return {
    isMainPaths: !!isExchange,
  };
};
