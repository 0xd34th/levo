'use client';

import { useEffect, useId, useState } from 'react';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAX_X_HANDLE_LENGTH, normalizeUsernameInput } from '@/lib/send-form';
import { isTrustedProfilePictureUrl } from '@/lib/transaction-history';

export type ResolvedUser = {
  xUserId: string;
  username: string;
  profilePicture: string | null;
  isBlueVerified: boolean;
  derivationVersion: number;
  vaultAddress: string;
};

interface UsernameInputProps {
  value: string;
  onValueChange: (value: string) => void;
  onResolvedChange: (user: ResolvedUser | null) => void;
}

type ResolveState = 'idle' | 'loading' | 'resolved' | 'error';

function truncateVaultAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export function UsernameInput({
  value,
  onValueChange,
  onResolvedChange,
}: UsernameInputProps) {
  const inputId = useId();
  const [state, setState] = useState<ResolveState>('idle');
  const [resolvedUser, setResolvedUser] = useState<ResolvedUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const username = normalizeUsernameInput(value);

    if (!username) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setState('loading');
      setError(null);

      try {
        const response = await fetch('/api/v1/resolve/x-username', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: 'Unable to resolve user' }));
          setState('error');
          setError(payload.error ?? 'Unable to resolve user');
          return;
        }

        const resolvedPayload = (await response.json()) as ResolvedUser;
        setResolvedUser(resolvedPayload);
        onResolvedChange(resolvedPayload);
        setState('resolved');
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        setState('error');
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to resolve user');
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [onResolvedChange, value]);

  const normalizedValue = normalizeUsernameInput(value);
  const visibleState = normalizedValue ? state : 'idle';
  const visibleUser = normalizedValue ? resolvedUser : null;
  const visibleError = normalizedValue ? error : null;

  const trustedAvatar =
    visibleUser?.profilePicture && isTrustedProfilePictureUrl(visibleUser.profilePicture)
      ? visibleUser.profilePicture
      : null;

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
          maxLength={MAX_X_HANDLE_LENGTH + 1}
          placeholder="username"
          spellCheck={false}
          type="text"
          value={value}
          onChange={(event) => {
            const nextValue = normalizeUsernameInput(event.target.value);

            setState('idle');
            setResolvedUser(null);
            setError(null);
            onResolvedChange(null);

            onValueChange(nextValue);
          }}
        />
        {visibleState === 'loading' ? (
          <LoaderCircle className="absolute right-5 top-1/2 size-5 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {visibleState === 'resolved' && visibleUser ? (
        <div className="rounded-[24px] border border-border/70 bg-card/90 p-4 shadow-sm dark:border-white/10 dark:bg-[#131922]/90 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex items-center gap-3">
            <Avatar className="size-12 border-border/60 dark:border-white/8">
              {trustedAvatar ? <AvatarImage alt={`@${visibleUser.username}`} src={trustedAvatar} /> : null}
              <AvatarFallback>
                {visibleUser.username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-base font-semibold">@{visibleUser.username}</p>
                {visibleUser.isBlueVerified ? (
                  <Badge variant="secondary" className="gap-1 rounded-full border border-border/70 bg-secondary/80 px-2.5 text-[11px] text-foreground dark:border-white/10 dark:bg-white/6">
                    <CheckCircle2 className="size-3.5 text-accent" />
                    Verified
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Vault ready: {truncateVaultAddress(visibleUser.vaultAddress)}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {visibleState === 'error' && visibleError ? (
        <div className="rounded-[20px] border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          {visibleError}
        </div>
      ) : null}
    </div>
  );
}
