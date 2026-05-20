'use client';

import { useMemo, useState, type FC, type MouseEvent } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { EntityAvatar } from '../EntityAvatar/EntityAvatar';
import { AvatarSize } from '@/components/core/AvatarStack/AvatarStack.types';
import { useChains } from '@/hooks/useChains';

export interface ChainChipOption {
  chainId: number;
  /** Net USD output for this chain choice. Undefined if not yet computed. */
  netUSD?: number;
  /** True if this is the current best option among the alternatives. */
  isBest?: boolean;
}

export interface ChainChipProps {
  selectedChainId?: number;
  options: ChainChipOption[];
  onChange: (chainId: number) => void;
  disabled?: boolean;
  /** Optional label rendered above the chip (e.g. "Source", "Destination"). */
  label?: string;
  /** Compact mode shows only the chain logo without the chain name text. */
  compact?: boolean;
}

const formatDelta = (
  netUSD: number | undefined,
  bestNetUSD: number | undefined,
) => {
  if (netUSD === undefined || bestNetUSD === undefined || bestNetUSD === 0) {
    return null;
  }
  const pct = ((netUSD - bestNetUSD) / bestNetUSD) * 100;
  if (Math.abs(pct) < 0.005) {
    return '±0.00%';
  }
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
};

export const ChainChip: FC<ChainChipProps> = ({
  selectedChainId,
  options,
  onChange,
  disabled,
  label,
  compact,
}) => {
  const { getChainById } = useChains();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const selectedChain = selectedChainId
    ? getChainById(selectedChainId)
    : undefined;

  const sortedOptions = useMemo(() => {
    return [...options].sort((a, b) => {
      const aN = a.netUSD ?? -Infinity;
      const bN = b.netUSD ?? -Infinity;
      return bN - aN;
    });
  }, [options]);

  const bestNetUSD = sortedOptions.find((o) => o.isBest)?.netUSD;

  const open = Boolean(anchor);
  const interactive = !disabled && options.length > 1;

  return (
    <Stack spacing={0.5} sx={{ minWidth: 0 }}>
      {label ? (
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', textTransform: 'uppercase' }}
        >
          {label}
        </Typography>
      ) : null}

      <ButtonBase
        disabled={!interactive}
        onClick={(e: MouseEvent<HTMLElement>) =>
          interactive && setAnchor(e.currentTarget)
        }
        sx={(theme) => ({
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          px: 0.75,
          py: 0.25,
          borderRadius: 999,
          border: `1px solid ${theme.palette.divider}`,
          backgroundColor: theme.palette.background.paper,
          cursor: interactive ? 'pointer' : 'default',
          opacity: disabled ? 0.6 : 1,
          minHeight: 28,
          '&:hover': interactive
            ? { backgroundColor: theme.palette.action.hover }
            : {},
        })}
      >
        {selectedChain ? (
          <EntityAvatar entity={selectedChain} size={AvatarSize['3XS']} />
        ) : (
          <Box sx={{ width: 16, height: 16 }} />
        )}
        {!compact ? (
          <Typography
            variant="caption"
            noWrap
            sx={{ fontWeight: 600 }}
          >
            {selectedChain?.name ?? '—'}
          </Typography>
        ) : null}
        {interactive ? (
          <KeyboardArrowDownIcon sx={{ fontSize: 14, opacity: 0.7 }} />
        ) : null}
      </ButtonBase>

      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: { sx: { mt: 0.5, minWidth: 220, maxHeight: 360 } },
        }}
      >
        <List dense disablePadding>
          {sortedOptions.map((opt) => {
            const chain = getChainById(opt.chainId);
            const delta = formatDelta(opt.netUSD, bestNetUSD);
            return (
              <ListItemButton
                key={opt.chainId}
                selected={opt.chainId === selectedChainId}
                onClick={() => {
                  onChange(opt.chainId);
                  setAnchor(null);
                }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ width: '100%', alignItems: 'center' }}
                >
                  {chain ? (
                    <EntityAvatar entity={chain} size={AvatarSize.XS} />
                  ) : null}
                  <ListItemText
                    primary={chain?.name ?? `Chain ${opt.chainId}`}
                    secondary={
                      opt.isBest
                        ? 'Best rate'
                        : delta
                          ? `${delta} vs best`
                          : opt.netUSD === undefined
                            ? 'Quote pending'
                            : undefined
                    }
                    slotProps={{
                      primary: { variant: 'body2', sx: { fontWeight: 600 } },
                      secondary: {
                        variant: 'caption',
                        sx: {
                          color: opt.isBest ? 'success.main' : 'text.secondary',
                        },
                      },
                    }}
                  />
                </Stack>
              </ListItemButton>
            );
          })}
        </List>
      </Popover>
    </Stack>
  );
};
