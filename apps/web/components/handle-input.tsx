'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type ResolvedUser = {
  xUserId: string;
  username: string;
  profilePicture: string | null;
  isBlueVerified: boolean;
  derivationVersion: number;
  vaultAddress: string;
};

interface HandleInputProps {
  onResolved: (user: ResolvedUser | null) => void;
  onLoading: (loading: boolean) => void;
  onError: (error: string | null) => void;
}

export function HandleInput({ onResolved, onLoading, onError }: HandleInputProps) {
  const [value, setValue] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const resolve = useCallback(
    async (username: string) => {
      // Cancel any in-flight request
      abortRef.current?.abort();

      if (!username) {
        onResolved(null);
        onLoading(false);
        onError(null);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      onLoading(true);
      onError(null);
      onResolved(null);

      try {
        const res = await fetch('/api/v1/resolve/x-username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Request failed' }));
          onError(data.error ?? `Error ${res.status}`);
          onResolved(null);
          return;
        }

        const data: ResolvedUser = await res.json();
        onResolved(data);
        onError(null);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        onError('Network error');
        onResolved(null);
      } finally {
        if (!controller.signal.aborted) {
          onLoading(false);
        }
      }
    },
    [onResolved, onLoading, onError],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/^@/, '').slice(0, 15);
    setValue(raw);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      resolve(raw.trim());
    }, 500);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  return (
    <div className="space-y-2">
      <Label htmlFor="handle-input">Recipient X Handle</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          @
        </span>
        <Input
          id="handle-input"
          type="text"
          placeholder="username"
          value={value}
          onChange={handleChange}
          maxLength={15}
          className="pl-7"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
