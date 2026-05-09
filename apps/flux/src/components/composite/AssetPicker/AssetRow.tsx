import { type FC } from 'react';
import Avatar from '@mui/material/Avatar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { AssetGroup } from '@/types/assets';
import { AvatarSize } from '@/components/core/AvatarStack/AvatarStack.types';
import { ChainAvatar } from './ChainAvatar';

const MAX_INLINE_CHAINS = 4;

const SIZE_PX: Record<AvatarSize, number> = {
  [AvatarSize['3XS']]: 12,
  [AvatarSize.XXS]: 14,
  [AvatarSize.XS]: 16,
  [AvatarSize.SM]: 20,
  [AvatarSize.MD]: 28,
  [AvatarSize.LG]: 36,
  [AvatarSize.XL]: 48,
  [AvatarSize.XXL]: 64,
};

export interface AssetRowProps {
  group: AssetGroup;
  /** Tokens get a primary "selected" chain when displayed in a swap context. */
  selectedChainId?: number;
  /** Compact mode hides the name (only symbol shown). */
  compact?: boolean;
  tokenSize?: AvatarSize;
}

export const AssetRow: FC<AssetRowProps> = ({
  group,
  selectedChainId,
  compact,
  tokenSize = AvatarSize.MD,
}) => {
  const tokenPx = SIZE_PX[tokenSize];
  const visibleChains = group.instances.slice(0, MAX_INLINE_CHAINS);
  const hiddenCount = group.instances.length - visibleChains.length;
  const orderedChains = selectedChainId
    ? [
        ...visibleChains.filter((t) => t.chainId === selectedChainId),
        ...visibleChains.filter((t) => t.chainId !== selectedChainId),
      ]
    : visibleChains;

  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ minWidth: 0, alignItems: 'center' }}
    >
      <Avatar
        src={group.logoURI}
        alt={group.name}
        sx={{ width: tokenPx, height: tokenPx }}
      />
      <Stack sx={{ minWidth: 0 }}>
        <Typography
          variant="subtitle2"
          noWrap
          sx={{ fontWeight: 700 }}
        >
          {group.symbol}
        </Typography>
        {!compact ? (
          <Typography variant="caption" color="text.secondary" noWrap>
            {group.name}
          </Typography>
        ) : null}
      </Stack>
      <Stack
        direction="row"
        spacing={-0.75}
        sx={{ ml: 'auto', alignItems: 'center' }}
      >
        {orderedChains.map((t) => (
          <ChainAvatar
            key={t.chainId}
            chainId={t.chainId}
            size={AvatarSize.XS}
          />
        ))}
        {hiddenCount > 0 ? (
          <Typography
            variant="caption"
            sx={{
              ml: 0.75,
              color: 'text.secondary',
              fontWeight: 600,
            }}
          >
            +{hiddenCount}
          </Typography>
        ) : null}
      </Stack>
    </Stack>
  );
};
