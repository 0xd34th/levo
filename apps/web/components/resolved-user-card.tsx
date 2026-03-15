'use client';

import type { ResolvedUser } from '@/components/handle-input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { isTrustedProfilePictureUrl } from '@/lib/transaction-history';

interface ResolvedUserCardProps {
  user: ResolvedUser | null;
  loading: boolean;
  error: string | null;
}

function truncateAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export function ResolvedUserCard({ user, loading, error }: ResolvedUserCardProps) {
  if (error) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent>
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!user) return null;

  const profilePicture =
    user.profilePicture && isTrustedProfilePictureUrl(user.profilePicture)
      ? user.profilePicture
      : null;

  return (
    <Card>
      <CardContent>
        <div className="flex items-center gap-3">
          {profilePicture ? (
            <img
              src={profilePicture}
              alt={`@${user.username}`}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              {user.username[0]?.toUpperCase() ?? '?'}
            </div>
          )}
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
