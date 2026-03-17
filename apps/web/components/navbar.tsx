'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLoginWithOAuth, usePrivy } from '@privy-io/react-auth';
import { ArrowUpRight, CreditCard, LogOut, Search, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';

const navigation = [
  { href: '/', label: 'Send', icon: CreditCard, matchPrefix: '/' },
  { href: '/dashboard/sent', label: 'Dashboard', icon: ArrowUpRight, matchPrefix: '/dashboard' },
  { href: '/lookup', label: 'Lookup', icon: Search, matchPrefix: '/lookup' },
  { href: '/claim', label: 'Claim', icon: Sparkles, matchPrefix: '/claim' },
];

export function Navbar() {
  const pathname = usePathname();
  const { ready, authenticated, user, logout } = usePrivy();
  const { initOAuth } = useLoginWithOAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-3 rounded-full border border-border/80 bg-background/90 px-3 py-2 shadow-[0_12px_28px_rgba(15,23,42,0.08)] transition-colors hover:bg-secondary/90 dark:border-white/10 dark:bg-white/5 dark:shadow-[0_12px_28px_rgba(0,0,0,0.2)] dark:hover:bg-white/8"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-[0_12px_30px_rgba(91,127,255,0.38)] dark:shadow-[0_12px_30px_rgba(91,127,255,0.38)]">
              L
            </span>
            <span className="min-w-0">
              <span className="block font-display text-sm font-semibold tracking-[-0.03em]">
                Levo
              </span>
              <span className="block text-xs text-muted-foreground">
                Send to X, not addresses
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 rounded-full border border-border/80 bg-background/90 p-1 shadow-[0_10px_24px_rgba(15,23,42,0.06)] md:flex dark:border-white/8 dark:bg-white/4 dark:shadow-none">
            {navigation.map((item) => {
              const active =
                item.matchPrefix === '/' ? pathname === '/' : pathname.startsWith(item.matchPrefix);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-background text-foreground shadow-sm dark:bg-white/10'
                      : 'text-secondary-foreground hover:bg-secondary/90 hover:text-foreground dark:text-muted-foreground dark:hover:bg-white/6',
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="hidden border-border px-3 text-[11px] text-muted-foreground sm:inline-flex">
              {NETWORK}
            </Badge>

            <ThemeToggle />

            {ready && authenticated && user?.twitter ? (
              <div className="flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="hidden cursor-default rounded-full border-border/70 px-3 py-1.5 text-xs font-medium text-foreground sm:inline-flex dark:border-white/10"
                >
                  @{user.twitter.username}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Sign out"
                  className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                  onClick={() => logout()}
                  title="Sign out of X"
                >
                  <LogOut className="size-3.5" />
                </Button>
              </div>
            ) : ready && !authenticated ? (
              <Button
                variant="outline"
                className="h-9 rounded-full border-border/70 px-3 text-xs font-medium dark:border-white/10"
                onClick={() => {
                  void initOAuth({ provider: 'twitter' }).catch(() => {});
                }}
              >
                Sign in with X
              </Button>
            ) : null}
          </div>
        </div>

        <nav className="scrollbar-subtle mt-3 flex gap-1 overflow-x-auto pb-1 md:hidden">
          {navigation.map((item) => {
            const active =
              item.matchPrefix === '/' ? pathname === '/' : pathname.startsWith(item.matchPrefix);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'border-border/80 bg-background/90 text-foreground shadow-sm dark:border-white/8 dark:bg-white/10 dark:shadow-none'
                    : 'border-transparent text-secondary-foreground hover:border-border/80 hover:bg-background/90 hover:text-foreground dark:text-muted-foreground dark:hover:border-white/8 dark:hover:bg-white/6',
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
