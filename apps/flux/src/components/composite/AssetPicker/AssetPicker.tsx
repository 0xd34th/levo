'use client';

import { type FC, useState } from 'react';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import type { AssetGroup } from '@/types/assets';
import { AssetRow } from './AssetRow';
import { AssetPickerModal } from './AssetPickerModal';

export interface AssetPickerProps {
  groups?: AssetGroup[];
  label?: string;
  selected?: AssetGroup;
  selectedChainId?: number;
  onSelect: (group: AssetGroup) => void;
  modalTitle?: string;
  /** Optional whitelist of asset IDs (e.g. assets that have routes from the other side) */
  allowedAssetIds?: Set<string>;
  disabled?: boolean;
  placeholder?: string;
}

export const AssetPicker: FC<AssetPickerProps> = ({
  groups,
  label,
  selected,
  selectedChainId,
  onSelect,
  modalTitle,
  allowedAssetIds,
  disabled,
  placeholder = 'Select asset',
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
        {label ? (
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            {label}
          </Typography>
        ) : null}
        <ButtonBase
          disabled={disabled}
          onClick={() => setOpen(true)}
          sx={(theme) => ({
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            width: '100%',
            px: 1.5,
            py: 1.25,
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            backgroundColor: theme.palette.background.paper,
            cursor: disabled ? 'default' : 'pointer',
            transition: theme.transitions.create([
              'border-color',
              'background-color',
            ]),
            '&:hover': disabled
              ? {}
              : {
                  borderColor: theme.palette.text.primary,
                  backgroundColor: theme.palette.action.hover,
                },
          })}
        >
          {selected ? (
            <AssetRow group={selected} selectedChainId={selectedChainId} />
          ) : (
            <Typography variant="body2" color="text.secondary">
              {placeholder}
            </Typography>
          )}
          <KeyboardArrowDownIcon sx={{ opacity: 0.7 }} />
        </ButtonBase>
      </Stack>

      <AssetPickerModal
        open={open}
        onClose={() => setOpen(false)}
        onSelect={onSelect}
        title={modalTitle ?? label ?? 'Select asset'}
        allowedAssetIds={allowedAssetIds}
        groups={groups}
      />
    </>
  );
};
