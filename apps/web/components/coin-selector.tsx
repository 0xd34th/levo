'use client';

import Image from 'next/image';
import { getSelectableCoinOptions } from '@/lib/coins';
import { cn } from '@/lib/utils';

interface CoinOption {
  value: string;
  label: string;
  caption: string;
  icon: {
    alt: string;
    src: string;
  };
}

interface CoinSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

function getCoinOptions(): CoinOption[] {
  return getSelectableCoinOptions().map((option) => ({
    value: option.coinType,
    label: option.label,
    caption: option.caption,
    icon: {
      alt: `${option.label} icon`,
      src: option.iconSrc,
    },
  }));
}

/**
 * v3 token picker — two soft surface tiles, active state flips to ink-on-white with a thin ring.
 */
export function CoinSelector({ value, onValueChange, disabled = false }: CoinSelectorProps) {
  const options = getCoinOptions();

  return (
    <div className="space-y-2.5">
      <p className="eyebrow">Token</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onValueChange(option.value)}
              className={cn(
                'group flex items-center gap-3 rounded-[16px] px-4 py-3 text-left transition-colors',
                active
                  ? 'bg-background text-foreground ring-1 ring-[color:var(--border-strong)]'
                  : 'bg-surface text-foreground hover:bg-raise',
                disabled ? 'pointer-events-none opacity-60' : null,
              )}
            >
              <span
                className={cn(
                  'flex size-10 items-center justify-center rounded-[12px] bg-raise',
                  active ? 'bg-surface' : null,
                )}
              >
                <Image
                  alt={option.icon.alt}
                  className="size-8 object-contain"
                  height={40}
                  src={option.icon.src}
                  width={40}
                />
              </span>
              <span className="flex flex-col">
                <span className="text-[15px] font-semibold tracking-[-0.005em]">
                  {option.label}
                </span>
                <span
                  className="text-[12px]"
                  style={{ color: 'var(--text-mute)' }}
                >
                  {option.caption}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
