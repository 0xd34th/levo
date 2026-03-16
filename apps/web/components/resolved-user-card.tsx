'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ResolvedUserPreview } from '@/lib/resolved-user';
import { isTrustedProfilePictureUrl } from '@/lib/transaction-history';

export type { ResolvedUserPreview } from '@/lib/resolved-user';

function truncateAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

interface ResolvedUserCardProps {
  user: ResolvedUserPreview;
}

export function ResolvedUserCard({ user }: ResolvedUserCardProps) {
  const profilePicture =
    user.profilePicture && isTrustedProfilePictureUrl(user.profilePicture)
      ? user.profilePicture
      : null;

  return (
    <Card>
      <CardContent>
        <div className="flex items-center gap-3">
          <Avatar className="size-10">
            {profilePicture ? (
              <AvatarImage
                alt={`@${user.username}`}
                sizes="40px"
                src={profilePicture}
              />
            ) : null}
            <AvatarFallback className="text-muted-foreground">
              {user.username[0]?.toUpperCase() ?? '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-sm truncate">@{user.username}</span>
              {user.isBlueVerified && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  Verified
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {truncateAddress(user.vaultAddress)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
