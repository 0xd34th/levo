'use client';

import { useId } from 'react';
import {
  Input,
  largeFormInputContentInsetClass,
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

/**
 * v3 amount input — quiet surface field, large tabular figure, token pill on the right.
 * Kept `pl-6` / `left-6` / `pl-14` class shape to satisfy the existing inset contract.
 */
export function AmountInput({
  amount,
  onAmountChange,
  coinType,
  disabled = false,
  availableBalance,
}: AmountInputProps) {
  const inputId = useId();
  const showsDollarPrefix = usesDollarAmountPrefix(coinType);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || isValidAmountInput(val, coinType)) {
      onAmountChange(val);
    }
  };

  const balanceDisplay =
    availableBalance != null
      ? `${formatAmount(availableBalance, coinType)} ${getCoinLabel(coinType)}`
      : null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={inputId} className="eyebrow">
          Amount
        </Label>
        {balanceDisplay ? (
          <span
            className="mono-nums text-[12px]"
            style={{ color: 'var(--text-mute)' }}
          >
            Available {balanceDisplay}
          </span>
        ) : null}
      </div>
      <div className="relative">
        {showsDollarPrefix ? (
          <span
            className={cn(
              'pointer-events-none absolute top-1/2 -translate-y-1/2 text-[22px] font-semibold',
              largeFormInputPrefixOffsetClass,
            )}
            style={{ color: 'var(--text-mute)' }}
          >
            $
          </span>
        ) : null}
        <Input
          id={inputId}
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={handleChange}
          disabled={disabled}
          className={cn(
            'h-[60px] rounded-[16px] border-0 bg-surface text-[22px] font-semibold tabular-nums tracking-[-0.02em] focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-0',
            'pr-24',
            showsDollarPrefix
              ? largeFormInputPrefixedContentInsetClass
              : largeFormInputContentInsetClass,
          )}
          autoComplete="off"
        />
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-raise px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: 'var(--text-soft)' }}
        >
          {getCoinLabel(coinType)}
        </span>
      </div>
    </div>
  );
}
