import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

let pathname = '/lookup';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

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
    authenticated: true,
    user: { twitter: { username: 'tenxhunter' } },
    logout: vi.fn(),
  }),
}));

vi.mock('@/components/agent/FloatingAgentButton', () => ({
  FloatingAgentButton: () => <div>FloatingAgentButton</div>,
}));

vi.mock('@/components/mobile-top-bar', () => ({
  MobileTopBar: () => <div>MobileTopBar</div>,
}));

vi.mock('@/components/segmented-tabs', () => ({
  SegmentedTabs: () => <div>SegmentedTabs</div>,
}));

vi.mock('@/components/wordmark', () => ({
  Wordmark: () => <span>levo</span>,
}));

import { LevoWebShell } from './levo-web-shell';

describe('LevoWebShell', () => {
  it('renders desktop navigation, active lookup state, and a visible sign out action', () => {
    pathname = '/lookup';

    const markup = renderToStaticMarkup(
      <LevoWebShell showMobileTopBar={false}>
        <div>Lookup content</div>
      </LevoWebShell>,
    );

    expect(markup).toContain('aria-label="Desktop navigation"');
    expect(markup).toContain('href="/lookup"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('@tenxhunter');
    expect(markup).toContain('Sign out');
    expect(markup).toContain('absolute bottom-4 left-4 right-4');
    expect(markup).not.toContain('MobileTopBar');
  });
});
