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
import { detectRecipientType } from '@/lib/recipient';
import {
  MAX_SUI_ADDRESS_LENGTH,
  normalizeRecipientInput,
} from '@/lib/send-form';
import { cn } from '@/lib/utils';

interface UsernameInputProps {
  disabled?: boolean;
  value: string;
  onValueChange: (value: string) => void;
}

export function UsernameInput({ disabled = false, value, onValueChange }: UsernameInputProps) {
  const inputId = useId();
  const recipientType = detectRecipientType(value);
  const isAddressMode = recipientType === 'SUI_ADDRESS';
  // Hide the visual @ when the stored value already contains one (e.g. "@0xABCD")
  const showAtPrefix = !isAddressMode && !value.startsWith('@');

  return (
    <div className="space-y-3">
      <Label htmlFor={inputId} className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {isAddressMode ? 'Sui Address' : 'X Handle'}
      </Label>

      <div className="relative">
        {showAtPrefix && (
          <span
            className={cn(
              'pointer-events-none absolute top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground',
              largeFormInputPrefixOffsetClass,
            )}
          >
            @
          </span>
        )}
        <Input
          id={inputId}
          autoComplete="off"
          className={cn(
            largeFormInputFieldClass,
            'pr-14 text-lg font-medium text-foreground placeholder:text-muted-foreground/60',
            isAddressMode ? 'font-mono text-sm' : null,
            isAddressMode || !showAtPrefix
              ? largeFormInputContentInsetClass
              : largeFormInputPrefixedContentInsetClass,
          )}
          disabled={disabled}
          maxLength={MAX_SUI_ADDRESS_LENGTH}
          placeholder={isAddressMode ? '0x...' : 'username'}
          spellCheck={false}
          type="text"
          value={value}
          onChange={(event) => {
            onValueChange(normalizeRecipientInput(event.target.value));
          }}
        />
      </div>
    </div>
  );
}
