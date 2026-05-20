'use client';

import { type FC, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import { ModalContainer } from '@/components/core/modals/ModalContainer/ModalContainer';
import type { AssetGroup } from '@/types/assets';
import { useAssetGroups } from '@/hooks/useAssetGroups';
import { AssetRow } from './AssetRow';

interface AssetPickerModalProps {
  groups?: AssetGroup[];
  open: boolean;
  onClose: () => void;
  onSelect: (group: AssetGroup) => void;
  title?: string;
  /** Restrict picker to a subset of asset IDs (e.g. only assets with available routes). */
  allowedAssetIds?: Set<string>;
}

export const AssetPickerModal: FC<AssetPickerModalProps> = ({
  groups: constrainedGroups,
  open,
  onClose,
  onSelect,
  title = 'Select asset',
  allowedAssetIds,
}) => {
  const { groups: defaultGroups, isLoading } = useAssetGroups();
  const groups = constrainedGroups ?? defaultGroups;
  const showLoading = constrainedGroups ? false : isLoading;
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      if (allowedAssetIds && !allowedAssetIds.has(g.id)) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        g.symbol.toLowerCase().includes(q) ||
        g.name.toLowerCase().includes(q)
      );
    });
  }, [groups, query, allowedAssetIds]);

  return (
    <ModalContainer isOpen={open} onClose={onClose}>
      <Box
        sx={{
          width: { xs: '100%', sm: 480 },
          maxWidth: '100vw',
          maxHeight: '80vh',
          backgroundColor: 'background.paper',
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Stack
          direction="row"
          sx={{
            px: 2,
            py: 1.5,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="h6">{title}</Typography>
          <IconButton onClick={onClose} aria-label="Close">
            <CloseIcon />
          </IconButton>
        </Stack>
        <Box sx={{ px: 2, pb: 1 }}>
          <TextField
            fullWidth
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or symbol"
            size="small"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto', px: 1 }}>
          {showLoading ? (
            <Stack sx={{ py: 4, alignItems: 'center' }}>
              <CircularProgress size={28} />
            </Stack>
          ) : filtered.length === 0 ? (
            <Stack sx={{ py: 4, alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No assets match
              </Typography>
            </Stack>
          ) : (
            <List dense disablePadding>
              {filtered.slice(0, 200).map((g) => (
                <ListItemButton
                  key={g.id}
                  onClick={() => {
                    onSelect(g);
                    onClose();
                  }}
                  sx={{ borderRadius: 1, mb: 0.5 }}
                >
                  <AssetRow group={g} />
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>
      </Box>
    </ModalContainer>
  );
};
