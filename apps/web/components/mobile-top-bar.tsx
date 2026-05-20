'use client';

import Link from 'next/link';
import { ArrowLeft, LogOut } from 'lucide-react';
import { useLoginWithOAuth, usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/wordmark';

interface MobileTopBarProps {
  title?: string;
  backHref?: string;
  handle?: string;
}

export function MobileTopBar({ title, backHref, handle }: MobileTopBarProps) {
  const { ready, authenticated, user, logout } = usePrivy();
  const { initOAuth } = useLoginWithOAuth();

  const twitterHandle = handle ?? user?.twitter?.username ?? null;
  const centered = title ?? null;

  return (
    <header className="sticky top-0 z-40 bg-background">
      <div className="mx-auto grid h-14 w-full max-w-lg grid-cols-[44px_1fr_auto] items-center gap-2 px-4 md:max-w-2xl lg:max-w-4xl">
        <div className="flex items-center">
          {backHref ? (
            <Link
              href={backHref}
              className="-ml-2 flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface"
              aria-label="Back"
            >
              <ArrowLeft className="size-5" strokeWidth={1.8} />
            </Link>
          ) : (
            <Link href="/" aria-label="Home" className="inline-flex items-center">
              <Wordmark size={15} />
            </Link>
          )}
        </div>

        <div className="min-w-0 text-center">
          {centered ? (
            <>
              <div className="truncate text-[17px] font-semibold leading-tight tracking-[-0.01em]">
                {centered}
              </div>
              {twitterHandle ? (
                <div className="mt-0.5 text-[12px]" style={{ color: 'var(--text-mute)' }}>
                  @{twitterHandle}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          {ready && authenticated && user?.twitter ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              className="size-9 rounded-full text-foreground/70 hover:text-foreground"
              onClick={() => logout()}
              title={`@${user.twitter.username} — Sign out`}
            >
              <LogOut className="size-4" strokeWidth={1.8} />
            </Button>
          ) : ready && !authenticated ? (
            <Button
              variant="ghost"
              className="h-9 rounded-full px-3 text-[13px] font-medium"
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
