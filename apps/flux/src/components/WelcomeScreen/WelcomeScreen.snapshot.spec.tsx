import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '../../../vitest.setup';
import { WelcomeScreen } from './WelcomeScreen';

const { setWelcomeScreenClosed, trackEvent, welcomeScreenClosed } = vi.hoisted(
  () => ({
    setWelcomeScreenClosed: vi.fn(),
    trackEvent: vi.fn(),
    welcomeScreenClosed: { current: false },
  }),
);

vi.mock('@/hooks/useWelcomeScreen', () => ({
  useWelcomeScreen: () => ({
    enabled: true,
    welcomeScreenClosed: welcomeScreenClosed.current,
    setWelcomeScreenClosed,
  }),
}));

vi.mock('@/hooks/userTracking/useUserTracking', () => ({
  useUserTracking: () => ({
    trackEvent,
  }),
}));

describe('WelcomeScreen', () => {
  afterEach(() => {
    welcomeScreenClosed.current = false;
    vi.clearAllMocks();
  });

  it('renders the homepage task entry points', () => {
    render(<WelcomeScreen />);

    expect(
      screen.getByRole('button', { name: /Swap on Sui/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Bridge from Sui/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Send to another chain/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Explore best routes/i }),
    ).toBeInTheDocument();
  });

  it('closes the welcome screen when a task entry is selected', () => {
    render(<WelcomeScreen />);

    fireEvent.click(screen.getByRole('button', { name: /Swap on Sui/i }));

    expect(setWelcomeScreenClosed).toHaveBeenCalledWith(true);
  });
});
