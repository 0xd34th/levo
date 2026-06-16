'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Bot,
  Home,
  LogIn,
  LogOut,
  Search,
  Settings,
  Wallet,
} from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { FloatingAgentButton } from '@/components/agent/FloatingAgentButton';
import { MobileTopBar } from '@/components/mobile-top-bar';
import { SegmentedTabs } from '@/components/segmented-tabs';
import { Wordmark } from '@/components/wordmark';
import { cn } from '@/lib/utils';
import { useXSignIn } from '@/lib/use-x-sign-in';

const nav = [
  { href: '/', label: 'Account', icon: Home, match: (p: string) => p === '/' },
  { href: '/agent', label: 'Agent', icon: Bot, match: (p: string) => p.startsWith('/agent') || p.startsWith('/ai') },
  { href: '/activity', label: 'Activity', icon: Activity, match: (p: string) => p.startsWith('/activity') },
  { href: '/lookup', label: 'Lookup', icon: Search, match: (p: string) => p.startsWith('/lookup') },
  { href: '/tools', label: 'Tools', icon: Settings, match: (p: string) => p.startsWith('/tools') },
];

interface LevoWebShellProps {
  children: React.ReactNode;
  contentClassName?: string;
  showMobileTopBar?: boolean;
}

export function LevoWebShell({
  children,
  contentClassName,
  showMobileTopBar = true,
}: LevoWebShellProps) {
  const pathname = usePathname();
  const { ready, authenticated, user, logout } = usePrivy();
  const { signIn: signInWithX } = useXSignIn();
  const twitterHandle = user?.twitter?.username ?? null;

  return (
    <div className="min-h-screen bg-background">
      {showMobileTopBar ? (
        <div className="lg:hidden">
          <MobileTopBar />
        </div>
      ) : null}
      <div className="lg:min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] border-r border-[color:var(--border)] bg-background px-4 py-5 lg:flex lg:flex-col">
          <Link href="/" className="flex items-center gap-3 rounded-[10px] px-2 py-2">
            <Wordmark size={24} />
          </Link>
          <nav className="mt-8 flex flex-col gap-1" aria-label="Desktop navigation">
            {nav.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-10 items-center gap-3 rounded-[8px] px-3 text-[14px] font-medium transition',
                    active
                      ? 'bg-foreground text-background'
                      : 'text-[color:var(--text-soft)] hover:bg-[color:var(--surface)] hover:text-foreground',
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto space-y-3 pb-[96px]">
            <div className="rounded-[12px] bg-[color:var(--surface)] p-3">
              <div className="flex items-center gap-2 text-[13px] font-medium">
                <Wallet className="size-4" />
                Levo Agent
              </div>
              <p className="mt-1 text-[12px]" style={{ color: 'var(--text-soft)' }}>
                Send, lookup, repeat, and new mandate commands stay behind review steps.
              </p>
            </div>
            {ready && authenticated ? (
              <div className="absolute bottom-4 left-4 right-4 z-30 rounded-[12px] border border-[color:var(--border)] bg-background p-3 shadow-sm">
                <p className="truncate text-[12px] font-medium" style={{ color: 'var(--text-soft)' }}>
                  {twitterHandle ? `@${twitterHandle}` : 'Signed in'}
                </p>
                <button
                  type="button"
                  className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-[8px] bg-foreground px-3 text-[13px] font-medium text-background transition opacity-100 hover:opacity-90"
                  onClick={() => logout()}
                >
                  <LogOut className="size-4" />
                  Sign out
                </button>
              </div>
            ) : ready ? (
              <button
                type="button"
                className="absolute bottom-4 left-4 right-4 z-30 flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[color:var(--border)] bg-background px-3 text-[13px] font-medium shadow-sm transition hover:bg-[color:var(--surface)]"
                onClick={signInWithX}
              >
                <LogIn className="size-4" />
                Sign in
              </button>
            ) : null}
          </div>
        </aside>

        <main className="min-w-0 lg:ml-[248px]">
          <div
            className={cn(
              'mx-auto w-full max-w-lg px-5 pb-24 pt-2 md:max-w-2xl lg:max-w-none lg:px-8 lg:py-8',
              contentClassName,
            )}
          >
            {showMobileTopBar ? (
              <div className="mb-5 lg:hidden">
                <SegmentedTabs />
              </div>
            ) : null}
            {children}
          </div>
        </main>
      </div>
      <FloatingAgentButton className="lg:hidden" />
    </div>
  );
}
