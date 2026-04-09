import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  initOAuthMock,
  logoutMock,
  useLoginWithOAuthMock,
  usePathnameMock,
  usePrivyMock,
} = vi.hoisted(() => ({
  initOAuthMock: vi.fn(),
  logoutMock: vi.fn(),
  useLoginWithOAuthMock: vi.fn(),
  usePathnameMock: vi.fn(),
  usePrivyMock: vi.fn(),
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

vi.mock('next/navigation', () => ({
  usePathname: usePathnameMock,
}));

vi.mock('@privy-io/react-auth', () => ({
  useLoginWithOAuth: useLoginWithOAuthMock,
  usePrivy: usePrivyMock,
}));

vi.mock('@/components/theme-toggle', () => ({
  ThemeToggle: () => <div>theme-toggle</div>,
}));

import { Navbar } from './navbar';

describe('Navbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePathnameMock.mockReturnValue('/');
    useLoginWithOAuthMock.mockReturnValue({ initOAuth: initOAuthMock });
  });

  it('hides Activity when the viewer is not authenticated', () => {
    usePrivyMock.mockReturnValue({
      ready: true,
      authenticated: false,
      user: null,
      logout: logoutMock,
    });

    const markup = renderToStaticMarkup(<Navbar />);

    expect(markup).not.toContain('/activity');
    expect(markup).toContain('Send');
    expect(markup).toContain('Lookup');
    expect(markup).not.toContain('Claim');
  });

  it('shows Activity linking to /activity when the viewer is authenticated', () => {
    usePrivyMock.mockReturnValue({
      ready: true,
      authenticated: true,
      user: {
        twitter: {
          username: 'alice',
        },
      },
      logout: logoutMock,
    });

    const markup = renderToStaticMarkup(<Navbar />);

    expect(markup).toContain('Activity');
    expect(markup).toContain('href="/activity"');
  });

  it('highlights Activity link when pathname is /activity', () => {
    usePathnameMock.mockReturnValue('/activity');
    usePrivyMock.mockReturnValue({
      ready: true,
      authenticated: true,
      user: {
        twitter: {
          username: 'alice',
        },
      },
      logout: logoutMock,
    });

    const markup = renderToStaticMarkup(<Navbar />);

    // The active link gets the "bg-background" class while inactive ones do not
    const activityLinkMatch = markup.match(/<a[^>]*href="\/activity"[^>]*class="([^"]*)"/);
    expect(activityLinkMatch).not.toBeNull();
    expect(activityLinkMatch![1]).toContain('bg-background');
  });
});
