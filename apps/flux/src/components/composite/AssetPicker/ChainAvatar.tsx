import { type FC } from 'react';
import Avatar from '@mui/material/Avatar';
import { useChains } from '@/hooks/useChains';
import { AvatarSize } from '@/components/core/AvatarStack/AvatarStack.types';

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

interface ChainAvatarProps {
  chainId: number;
  size?: AvatarSize;
}

export const ChainAvatar: FC<ChainAvatarProps> = ({
  chainId,
  size = AvatarSize.XS,
}) => {
  const { getChainById } = useChains();
  const chain = getChainById(chainId);
  const px = SIZE_PX[size];
  return (
    <Avatar
      src={chain?.logoURI}
      alt={chain?.name ?? `Chain ${chainId}`}
      sx={{
        width: px,
        height: px,
        bgcolor: 'background.paper',
        border: '2px solid',
        borderColor: 'background.paper',
      }}
    />
  );
};
