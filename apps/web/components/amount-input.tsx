'use client';

import { useId } from 'react';
import {
  Input,
  largeFormInputContentInsetClass,
  largeFormInputFieldClass,
  largeFormInputPrefixOffsetClass,
  largeFormInputPrefixedContentInsetClass,
} from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usesDollarAmountPrefix } from '@/lib/send-form';
import { formatAmount, getCoinLabel, isValidAmountInput } from '@/lib/coins';
import { cn } from '@/lib/utils';

interface AmountInputProps {
  amount: string;
  onAmountChange: (amount: string) => void;
  coinType: string;
  disabled?: boolean;
  /** Raw balance in base units (e.g. "5000000") for the selected coin type. */
  availableBalance?: string | null;
}

export function AmountInput({ amount, onAmountChange, coinType, disabled = false, availableBalance }: AmountInputProps) {
  const inputId = useId();
  const showsDollarPrefix = usesDollarAmountPrefix(coinType);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || isValidAmountInput(val, coinType)) {
      onAmountChange(val);
    }
  };

  const balanceDisplay = availableBalance != null
    ? `${formatAmount(availableBalance, coinType)} ${getCoinLabel(coinType)}`
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <Label
          htmlFor={inputId}
          className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
        >
          Amount
        </Label>
        {balanceDisplay ? (
          <span className="text-xs text-muted-foreground">
            Balance: {balanceDisplay}
          </span>
        ) : null}
      </div>
      <div className="relative">
        {showsDollarPrefix ? (
          <span
            className={cn(
              'pointer-events-none absolute top-1/2 -translate-y-1/2 text-xl font-semibold text-foreground',
              largeFormInputPrefixOffsetClass,
            )}
          >
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
            largeFormInputFieldClass,
            'pr-24 text-2xl font-semibold tracking-[-0.04em] text-foreground placeholder:text-muted-foreground/45',
            showsDollarPrefix ? largeFormInputPrefixedContentInsetClass : largeFormInputContentInsetClass,
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
