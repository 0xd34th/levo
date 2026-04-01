'use client';

import Link from 'next/link';
import { ArrowLeft, LogOut } from 'lucide-react';
import { useLoginWithOAuth, usePrivy } from '@privy-io/react-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';

interface MobileTopBarProps {
  title?: string;
  backHref?: string;
}

export function MobileTopBar({ title = 'Levo', backHref }: MobileTopBarProps) {
  const { ready, authenticated, user, logout } = usePrivy();
  const { initOAuth } = useLoginWithOAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-lg items-center gap-3 px-4 md:max-w-2xl lg:max-w-4xl">
        {backHref ? (
          <Link
            href={backHref}
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </Link>
        ) : (
          <Link href="/" className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm">
            L
          </Link>
        )}

        <span className="flex-1 text-center font-display text-sm font-semibold tracking-tight">
          {title}
        </span>

        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="hidden border-border px-2.5 text-[11px] text-muted-foreground md:inline-flex">
            {NETWORK}
          </Badge>

          <ThemeToggle />

          {ready && authenticated && user?.twitter ? (
            <div className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className="hidden cursor-default rounded-full border-border/70 px-3 py-1.5 text-xs font-medium text-foreground md:inline-flex dark:border-white/10"
              >
                @{user.twitter.username}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                className="size-9 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => logout()}
                title={`@${user.twitter.username} — Sign out`}
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          ) : ready && !authenticated ? (
            <Button
              variant="ghost"
              className="h-9 rounded-full px-3 text-xs font-medium"
              onClick={() => {
                void initOAuth({ provider: 'twitter' }).catch(() => {});
              }}
            >
              Sign in
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
