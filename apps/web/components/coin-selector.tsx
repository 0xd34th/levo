'use client';

import { Droplets, Waves } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  MAINNET_USDC_TYPE,
  SUI_COIN_TYPE,
  getCoinLabel,
  getUserFacingUsdcCoinType,
} from '@/lib/coins';
import { cn } from '@/lib/utils';

interface CoinSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

function getCoinOptions() {
  const userFacingUsdcCoinType = getUserFacingUsdcCoinType();
  const stablecoinLabel = userFacingUsdcCoinType === MAINNET_USDC_TYPE ? 'USDC' : 'TEST USDC';

  return [
    {
      value: userFacingUsdcCoinType ?? SUI_COIN_TYPE,
      label: userFacingUsdcCoinType ? stablecoinLabel : 'SUI',
      caption: userFacingUsdcCoinType ? 'Stablecoin' : 'Native',
      icon: Droplets,
    },
    ...(userFacingUsdcCoinType
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

export function CoinSelector({ value, onValueChange, disabled = false }: CoinSelectorProps) {
  const options = getCoinOptions();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Token
        </p>
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
                  ? 'border-primary/35 bg-primary/12 text-foreground shadow-[0_14px_30px_rgba(65,99,239,0.14)] hover:bg-primary/14 dark:shadow-none'
                  : 'border-border/70 bg-card/92 text-secondary-foreground shadow-[0_10px_24px_rgba(15,23,42,0.05)] hover:bg-secondary/90 hover:text-foreground dark:border-white/8 dark:bg-white/4 dark:text-muted-foreground dark:shadow-none dark:hover:bg-white/7',
              )}
              variant="ghost"
              disabled={disabled}
              onClick={() => onValueChange(option.value)}
            >
              <span
                className={cn(
                  'flex size-10 items-center justify-center rounded-2xl',
                  active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground dark:bg-white/8 dark:text-muted-foreground',
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
