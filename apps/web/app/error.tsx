'use client';

import { Button } from '@/components/ui/button';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="w-full max-w-sm rounded-[20px] bg-surface px-6 py-7 text-center">
        <span
          className="mx-auto flex size-12 items-center justify-center rounded-[14px] text-[20px] font-semibold text-white"
          style={{ background: 'var(--down)' }}
        >
          !
        </span>
        <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.01em]">
          Something went wrong
        </h1>
        <p
          className="mt-2 text-[14px] leading-[1.45]"
          style={{ color: 'var(--text-soft)' }}
        >
          An unexpected error occurred. Try again, and if it keeps happening,
          refresh the page.
        </p>
        <Button
          size="lg"
          className="mt-6 h-[46px] w-full rounded-[14px] text-[15px]"
          onClick={reset}
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
