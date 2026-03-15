'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, CreditCard, Search, Sparkles } from 'lucide-react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { MintButton } from '@/components/mint-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { WalletConnectButton } from '@/components/wallet-connect-button';
import { cn } from '@/lib/utils';

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';
const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID ?? '';
const TREASURY_CAP_ID = process.env.NEXT_PUBLIC_TREASURY_CAP_ID ?? '';

const navigation = [
  { href: '/', label: 'Send', icon: CreditCard, matchPrefix: '/' },
  { href: '/dashboard/sent', label: 'Dashboard', icon: ArrowUpRight, matchPrefix: '/dashboard' },
  { href: '/lookup', label: 'Lookup', icon: Search, matchPrefix: '/lookup' },
  { href: '/claim', label: 'Claim', icon: Sparkles, matchPrefix: '/claim' },
];

function initials(address: string | undefined) {
  if (!address) return 'LV';
  return `${address.slice(2, 4)}${address.slice(-2)}`.toUpperCase();
}

export function Navbar() {
  const pathname = usePathname();
  const account = useCurrentAccount();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-3 rounded-full border border-border bg-secondary px-3 py-2 transition-colors hover:bg-muted"
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

          <nav className="hidden items-center gap-1 rounded-full border border-border bg-secondary p-1 md:flex">
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
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {PACKAGE_ID && TREASURY_CAP_ID && NETWORK !== 'mainnet' ? (
              <div className="hidden lg:block">
                <MintButton packageId={PACKAGE_ID} treasuryCapId={TREASURY_CAP_ID} />
              </div>
            ) : null}

            <Badge variant="outline" className="hidden border-border px-3 text-[11px] text-muted-foreground sm:inline-flex">
              {NETWORK}
            </Badge>

            <ThemeToggle />
            <WalletConnectButton />

            <div className="hidden items-center gap-2 rounded-full border border-border bg-secondary px-2 py-1.5 sm:flex">
              <Avatar className="size-8 border-border">
                <AvatarFallback className="text-[11px]">
                  {initials(account?.address)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xs font-medium">
                  {account ? 'Connected' : 'Guest'}
                </p>
                <p className="max-w-28 truncate text-[11px] text-muted-foreground">
                  {account?.address ?? 'Connect to send'}
                </p>
              </div>
            </div>
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
                    ? 'border-border bg-secondary text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground',
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
