import AltRouteRoundedIcon from '@mui/icons-material/AltRouteRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded';
import type { SvgIconComponent } from '@mui/icons-material';
import {
  TaskCardIcon,
  TaskCardLabel,
  TaskEntryButton,
  ToolCardsContainer as Container,
} from './ToolCards.style';

interface TaskEntry {
  id: string;
  label: string;
  Icon: SvgIconComponent;
  testId?: string;
}

const TASK_ENTRIES: TaskEntry[] = [
  {
    id: 'swap-on-sui',
    label: 'Swap on Sui',
    Icon: SwapHorizRoundedIcon,
  },
  {
    id: 'bridge-from-sui',
    label: 'Bridge from Sui',
    Icon: AltRouteRoundedIcon,
  },
  {
    id: 'send-to-another-chain',
    label: 'Send to another chain',
    Icon: SendRoundedIcon,
  },
  {
    id: 'explore-best-routes',
    label: 'Explore best routes',
    Icon: TravelExploreRoundedIcon,
    testId: 'get-started-button',
  },
];

interface ToolCardsProps {
  onTaskSelect: (task: TaskEntry) => void;
}

export const ToolCards = ({ onTaskSelect }: ToolCardsProps) => {
  return (
    <Container>
      {TASK_ENTRIES.map((task) => (
        <TaskEntryButton
          key={task.id}
          type="button"
          onClick={() => onTaskSelect(task)}
          data-testid={task.testId}
        >
          <TaskCardIcon>
            <task.Icon fontSize="small" />
          </TaskCardIcon>
          <TaskCardLabel variant="bodyMediumStrong">{task.label}</TaskCardLabel>
        </TaskEntryButton>
      ))}
    </Container>
  );
};
