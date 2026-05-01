import { Appearance } from '@lifi/widget';
import { ImageTheme } from 'src/components/ImageGeneration/ImageGeneration.types';

export const getOffset = (type?: string, extendedHeight?: boolean) => {
  if (type === 'amount') {
    return 46;
  }
  if (type === 'quote') {
    if (extendedHeight) {
      return 56;
    }
    return 16;
  } else {
    return 46;
  }
};
export const getWidth = (type?: string, fullWidth?: boolean) => {
  if (type === 'quote') {
    return 315;
  } else if (fullWidth) {
    return 368;
  } else {
    return 174;
  }
};

export const getResolvedMode = (mode?: Appearance | undefined): ImageTheme => {
  void mode;
  return 'light';
};
