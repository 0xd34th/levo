'use client';
import { Typography, styled } from '@mui/material';

export const ToolCardsContainer = styled('div')(({ theme }) => ({
  margin: theme.spacing(4, 'auto', 0),
  flexWrap: 'wrap',
  display: 'flex',
  justifyContent: 'center',
  maxWidth: 620,
  gap: theme.spacing(2),
  [theme.breakpoints.down('sm')]: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    width: '100%',
    gap: theme.spacing(1.5),
  },
}));

export const TaskEntryButton = styled('button')(({ theme }) => ({
  border: 0,
  cursor: 'pointer',
  minHeight: 112,
  width: 140,
  padding: theme.spacing(2),
  borderRadius: theme.shape.radius16,
  color: (theme.vars || theme).palette.accent1Alt.main,
  backgroundColor: (theme.vars || theme).palette.alphaLight200.main,
  boxShadow:
    '0px 2px 4px rgba(0, 0, 0, 0.04), 0px 8px 16px rgba(0, 0, 0, 0.08)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: theme.spacing(1.25),
  transitionProperty: 'background-color, box-shadow, transform',
  transitionDuration: '180ms',
  transitionTimingFunction: 'ease-in-out',
  userSelect: 'none',
  ...theme.applyStyles('light', {
    color: (theme.vars || theme).palette.primary.main,
    backgroundColor: (theme.vars || theme).palette.alphaLight600.main,
    boxShadow:
      '0px 2px 4px rgba(0, 0, 0, 0.04), 0px 8px 16px rgba(0, 0, 0, 0.04)',
  }),
  '&:hover': {
    backgroundColor: (theme.vars || theme).palette.alphaLight300.main,
    boxShadow: (theme.vars || theme).shadows[1],
    transform: 'translateY(-1px)',
    ...theme.applyStyles('light', {
      backgroundColor: (theme.vars || theme).palette.alphaLight400.main,
    }),
  },
  '&:focus-visible': {
    outline: `2px solid ${(theme.vars || theme).palette.accent1.main}`,
    outlineOffset: 3,
  },
  [theme.breakpoints.down('sm')]: {
    width: '100%',
    minHeight: 104,
    padding: theme.spacing(1.5),
  },
}));

export const TaskCardIcon = styled('span')(({ theme }) => ({
  width: 36,
  height: 36,
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: (theme.vars || theme).palette.alphaLight300.main,
  ...theme.applyStyles('light', {
    backgroundColor: (theme.vars || theme).palette.alphaLight400.main,
  }),
}));

export const TaskCardLabel = styled(Typography)(({ theme }) => ({
  fontSize: 14,
  lineHeight: '18px',
  letterSpacing: 0,
  maxWidth: '100%',
  overflowWrap: 'break-word',
  [theme.breakpoints.up('sm')]: {
    fontSize: 16,
    lineHeight: '20px',
  },
}));
