import type { RuntimeConfig } from '@/config/env-config';

export const getPathBasedIntegrator = (
  _pathname: string | null | undefined,
  config: RuntimeConfig,
): string => {
  return config.NEXT_PUBLIC_WIDGET_INTEGRATOR;
};
