'use client';

import { useId } from 'react';
import {
  Input,
  largeFormInputContentInsetClass,
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

/**
 * v3 recipient input — eyebrow label on top, surface field with leading @ or monospace address.
 * Preserves `pl-6` / `left-6` / `pl-14` class contract used by unit tests.
 */
export function UsernameInput({ disabled = false, value, onValueChange }: UsernameInputProps) {
  const inputId = useId();
  const recipientType = detectRecipientType(value);
  const isAddressMode = recipientType === 'SUI_ADDRESS';
  const showAtPrefix = !isAddressMode && !value.startsWith('@');

  return (
    <div className="space-y-2.5">
      <Label htmlFor={inputId} className="eyebrow">
        {isAddressMode ? 'Sui Address' : 'X Handle'}
      </Label>
      <div className="relative">
        {showAtPrefix && (
          <span
            className={cn(
              'pointer-events-none absolute top-1/2 -translate-y-1/2 text-[18px] font-medium',
              largeFormInputPrefixOffsetClass,
            )}
            style={{ color: 'var(--text-mute)' }}
          >
            @
          </span>
        )}
        <Input
          id={inputId}
          autoComplete="off"
          className={cn(
            'h-[60px] rounded-[16px] border-0 bg-surface text-[17px] font-medium placeholder:text-[color:var(--text-fade)] focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-0',
            isAddressMode ? 'font-mono text-sm' : null,
            isAddressMode || !showAtPrefix
              ? largeFormInputContentInsetClass
              : largeFormInputPrefixedContentInsetClass,
          )}
          disabled={disabled}
          maxLength={MAX_SUI_ADDRESS_LENGTH}
          placeholder={isAddressMode ? '0x…' : 'username'}
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
