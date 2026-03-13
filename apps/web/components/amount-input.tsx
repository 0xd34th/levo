'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AmountInputProps {
  amount: string;
  onAmountChange: (amount: string) => void;
  coinType: string;
}

/** Extract the human-readable coin name from a fully-qualified coin type. */
function coinLabel(coinType: string): string {
  // e.g. "0x123::test_usdc::TEST_USDC" -> "TEST_USDC"
  const parts = coinType.split('::');
  return parts.length >= 3 ? parts[parts.length - 1]! : 'TUSDC';
}

export function AmountInput({ amount, onAmountChange, coinType }: AmountInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow empty, digits, and a single decimal point
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
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
          {coinLabel(coinType)}
        </span>
      </div>
    </div>
  );
}
