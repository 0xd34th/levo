import type { WidgetContext } from '../widgetConfig/types';
import type { FormRef } from '@lifi/widget';

export interface WidgetProps {
  ctx: WidgetContext;
  formRef?: FormRef;
}
