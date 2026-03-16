'use client';

import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usesDollarAmountPrefix } from '@/lib/send-form';
import { getCoinLabel, isValidAmountInput } from '@/lib/coins';
import { cn } from '@/lib/utils';

interface AmountInputProps {
  amount: string;
  onAmountChange: (amount: string) => void;
  coinType: string;
  disabled?: boolean;
}

export function AmountInput({ amount, onAmountChange, coinType, disabled = false }: AmountInputProps) {
  const inputId = useId();
  const showsDollarPrefix = usesDollarAmountPrefix(coinType);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || isValidAmountInput(val, coinType)) {
      onAmountChange(val);
    }
  };

  return (
    <div className="space-y-3">
      <Label
        htmlFor={inputId}
        className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
      >
        Amount
      </Label>
      <div className="relative">
        {showsDollarPrefix ? (
          <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-xl font-semibold text-foreground">
            $
          </span>
        ) : null}
        <Input
          id={inputId}
          type="text"
          inputMode="decimal"
          placeholder="20.00"
          value={amount}
          onChange={handleChange}
          disabled={disabled}
          className={cn(
            'h-16 rounded-[22px] border-border/70 bg-background/80 pr-24 text-2xl font-semibold tracking-[-0.04em] text-foreground placeholder:text-muted-foreground/45 dark:border-white/10 dark:bg-white/5',
            showsDollarPrefix ? 'pl-10' : 'pl-5',
          )}
          autoComplete="off"
        />
        <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 rounded-full border border-border/60 bg-secondary/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:border-white/8 dark:bg-white/6">
          {getCoinLabel(coinType)}
        </span>
      </div>
    </div>
  );
}
