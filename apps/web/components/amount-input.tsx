'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getCoinLabel, isValidAmountInput } from '@/lib/coins';

interface AmountInputProps {
  amount: string;
  onAmountChange: (amount: string) => void;
  coinType: string;
}

export function AmountInput({ amount, onAmountChange, coinType }: AmountInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || isValidAmountInput(val, coinType)) {
      onAmountChange(val);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="amount-input">Amount</Label>
      <div className="relative">
        <Input
          id="amount-input"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={handleChange}
          className="pr-20"
          autoComplete="off"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
          {getCoinLabel(coinType)}
        </span>
      </div>
    </div>
  );
}
