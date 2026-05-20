import Link from 'next/link';
import { Wordmark } from '@/components/wordmark';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="w-full max-w-sm rounded-[20px] bg-surface px-6 py-7 text-center">
        <div className="flex justify-center">
          <Wordmark size={20} />
        </div>
        <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.01em]">
          Page not found
        </h1>
        <p
          className="mt-2 text-[14px] leading-[1.45]"
          style={{ color: 'var(--text-soft)' }}
        >
          This route doesn&rsquo;t exist. Check the URL, or head back to the
          wallet.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-[46px] w-full items-center justify-center rounded-[14px] bg-foreground px-5 text-[15px] font-semibold text-background transition-colors hover:bg-foreground/90"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
