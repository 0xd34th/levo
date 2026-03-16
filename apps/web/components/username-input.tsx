'use client';

import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAX_X_HANDLE_LENGTH, normalizeUsernameInput } from '@/lib/send-form';

interface UsernameInputProps {
  disabled?: boolean;
  value: string;
  onValueChange: (value: string) => void;
}

export function UsernameInput({ disabled = false, value, onValueChange }: UsernameInputProps) {
  const inputId = useId();

  return (
    <div className="space-y-3">
      <Label htmlFor={inputId} className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        X Handle
      </Label>

      <div className="relative">
        <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">
          @
        </span>
        <Input
          id={inputId}
          autoComplete="off"
          className="h-16 rounded-[22px] border-border/70 bg-background/80 pl-12 pr-14 text-lg font-medium text-foreground placeholder:text-muted-foreground/60 dark:border-white/10 dark:bg-white/5"
          disabled={disabled}
          maxLength={MAX_X_HANDLE_LENGTH + 1}
          placeholder="username"
          spellCheck={false}
          type="text"
          value={value}
          onChange={(event) => {
            onValueChange(normalizeUsernameInput(event.target.value));
          }}
        />
      </div>
    </div>
  );
}
