import * as React from 'react';
import Image, { type ImageProps } from 'next/image';
import { cn } from '@/lib/utils';

function Avatar({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar"
      className={cn(
        'relative flex size-10 shrink-0 overflow-hidden rounded-full border border-border/70 bg-secondary/80 dark:border-white/10 dark:bg-white/8',
        className,
      )}
      {...props}
    />
  );
}

interface AvatarImageProps extends Omit<ImageProps, 'alt' | 'fill'> {
  alt: string;
}

function AvatarImage({
  className,
  alt,
  sizes = '100vw',
  ...props
}: AvatarImageProps) {
  return (
    <Image
      fill
      loader={({ src }) => src}
      unoptimized
      sizes={sizes}
      data-slot="avatar-image"
      alt={alt}
      className={cn('absolute inset-0 size-full object-cover', className)}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar-fallback"
      className={cn(
        'flex size-full items-center justify-center bg-primary/14 text-sm font-semibold text-primary',
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
