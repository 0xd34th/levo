import { cn } from '@/lib/utils';

interface WordmarkProps {
  size?: number;
  className?: string;
}

/**
 * "levo · SUI" — sans-serif wordmark paired with a small uppercase network tag.
 * The only branded typography moment; keep it quiet.
 */
export function Wordmark({ size = 14, className }: WordmarkProps) {
  const dotSize = size * 0.5;

  return (
    <span
      className={cn('inline-flex items-baseline text-foreground', className)}
      style={{
        fontFamily: 'var(--font-sans)',
        fontWeight: 600,
        fontSize: size,
        letterSpacing: '-0.01em',
      }}
    >
      <span>levo</span>
      <span
        aria-hidden
        style={{
          fontSize: dotSize,
          color: 'var(--text-mute)',
          marginLeft: 4,
          fontWeight: 500,
        }}
      >
        ·
      </span>
      <span
        style={{
          fontSize: dotSize,
          color: 'var(--text-mute)',
          marginLeft: 2,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontWeight: 500,
        }}
      >
        sui
      </span>
    </span>
  );
}
