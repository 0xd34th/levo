import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

export const CustomColor = styled(Typography)(({ theme }) => ({
  backgroundImage: `linear-gradient(90deg, ${(theme.vars || theme).palette.text.primary} 10%, ${(theme.vars || theme).palette.accent2.main} 100%)`,
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  margin: 0,
  textFillColor: 'transparent',
  WebkitTextFillColor: 'transparent',
  userSelect: 'none',
}));
