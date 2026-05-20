'use client';

import { BadgeCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { ResolvedUserPreview } from '@/lib/resolved-user';
import { isTrustedProfilePictureUrl } from '@/lib/transaction-history';

export type { ResolvedUserPreview } from '@/lib/resolved-user';

function truncateAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

interface ResolvedUserCardProps {
  user: ResolvedUserPreview;
}

/**
 * v3 surface panel — avatar + @handle + verified tick + truncated canonical address.
 */
export function ResolvedUserCard({ user }: ResolvedUserCardProps) {
  const profilePicture =
    user.profilePicture && isTrustedProfilePictureUrl(user.profilePicture)
      ? user.profilePicture
      : null;

  return (
    <div className="flex items-center gap-3 rounded-[14px] bg-raise px-3.5 py-3">
      <Avatar className="size-10">
        {profilePicture ? (
          <AvatarImage alt={`@${user.username}`} sizes="40px" src={profilePicture} />
        ) : null}
        <AvatarFallback className="bg-transparent text-[13px] font-semibold">
          {user.username[0]?.toUpperCase() ?? '?'}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold">
            @{user.username}
          </span>
          {user.isBlueVerified ? (
            <BadgeCheck
              className="size-[14px]"
              style={{ color: 'var(--tile-blue)' }}
              strokeWidth={2}
            />
          ) : null}
        </div>
        <p
          className="mono-nums mt-0.5 text-[12px]"
          style={{ color: 'var(--text-mute)' }}
        >
          {truncateAddress(user.recipientAddress)}
        </p>
      </div>
    </div>
  );
}
