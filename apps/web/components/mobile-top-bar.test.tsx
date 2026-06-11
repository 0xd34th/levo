import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@privy-io/react-auth', () => ({
  useLoginWithOAuth: () => ({ initOAuth: vi.fn() }),
  usePrivy: () => ({
    ready: true,
    authenticated: false,
    user: null,
    logout: vi.fn(),
  }),
}));

import { MobileTopBar } from './mobile-top-bar';

describe('MobileTopBar', () => {
  it('keeps the back button anchored to the viewport edge on wide screens', () => {
    const markup = renderToStaticMarkup(<MobileTopBar title="Earn" backHref="/" />);

    expect(markup).toContain('aria-label="Back"');
    expect(markup).toContain('grid h-14 w-full grid-cols-[44px_1fr_auto]');
    expect(markup).not.toContain('max-w-lg');
    expect(markup).not.toContain('lg:max-w-4xl');
  });
});
