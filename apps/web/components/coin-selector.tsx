'use client';

import { Droplets, Waves } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SUI_COIN_TYPE, getCoinLabel, getTestUsdcCoinType } from '@/lib/coins';
import { cn } from '@/lib/utils';

interface CoinSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
}

function getCoinOptions() {
  const testUsdc = getTestUsdcCoinType();

  return [
    {
      value: testUsdc ?? SUI_COIN_TYPE,
      label: testUsdc ? 'TEST USDC' : 'SUI',
      caption: testUsdc ? 'Stablecoin' : 'Native',
      icon: Droplets,
    },
    ...(testUsdc
      ? [
          {
            value: SUI_COIN_TYPE,
            label: getCoinLabel(SUI_COIN_TYPE),
            caption: 'Native',
            icon: Waves,
          },
        ]
      : []),
  ];
}

export function CoinSelector({ value, onValueChange }: CoinSelectorProps) {
  const options = getCoinOptions();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Token
        </p>
        <Badge variant="outline" className="rounded-full border-border/70 px-2.5 text-[11px] text-muted-foreground dark:border-white/10">
          Sui settlement
        </Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const active = option.value === value;

          return (
            <Button
              key={option.value}
              className={cn(
                'h-auto justify-start rounded-[22px] border px-4 py-3 text-left',
                active
                  ? 'border-primary/40 bg-primary/14 text-foreground hover:bg-primary/16'
                  : 'border-border/60 bg-background/70 text-muted-foreground hover:bg-secondary/80 hover:text-foreground dark:border-white/8 dark:bg-white/4 dark:hover:bg-white/7',
              )}
              variant="ghost"
              onClick={() => onValueChange(option.value)}
            >
              <span
                className={cn(
                  'flex size-10 items-center justify-center rounded-2xl',
                  active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground dark:bg-white/8',
                )}
              >
                <option.icon className="size-4" />
              </span>
              <span className="ml-3 flex flex-col">
                <span className="font-semibold">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.caption}</span>
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
