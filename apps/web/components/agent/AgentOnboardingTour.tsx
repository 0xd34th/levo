'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Check, ChevronLeft, ChevronRight, HelpCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const AGENT_NEW_ONBOARDING_STORAGE_KEY = 'levo.agentOnboarding.new.v2';
export const AGENT_DASHBOARD_ONBOARDING_STORAGE_KEY = 'levo.agentOnboarding.dashboard.v2';

const TOUR_STORAGE_EVENT = 'levo-agent-onboarding-state';

type StoredTourStatus = 'dismissed' | 'completed';

export interface AgentOnboardingTourStep {
  anchor: string;
  eyebrow: string;
  title: string;
  body: string;
  opensSettings?: boolean;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export const AGENT_NEW_ONBOARDING_STEPS: AgentOnboardingTourStep[] = [
  {
    anchor: 'chat-start',
    eyebrow: 'Start',
    title: 'Use the command presets',
    body: 'Start from chat, wallet, on-chain, trade, or mandate commands.',
  },
  {
    anchor: 'mandate-intent',
    eyebrow: 'Mandate',
    title: 'Turn intent into an Earn mandate',
    body: 'Shape an Earn mandate from an intent.',
  },
  {
    anchor: 'mandate-preview',
    eyebrow: 'Approval',
    title: 'Review limits before signing',
    body: 'Review caps, cadence, expiry, and preview before signing.',
  },
  {
    anchor: 'runner-bind',
    eyebrow: 'Runner',
    title: 'Bind your external runner',
    body: 'Open settings and bind an external runner.',
    opensSettings: true,
  },
  {
    anchor: 'runner-token',
    eyebrow: 'Token',
    title: 'Store the setup prompt',
    body: 'Copy and store the one-time runner setup prompt after binding.',
    opensSettings: true,
  },
];

export const AGENT_DASHBOARD_ONBOARDING_STEPS: AgentOnboardingTourStep[] = [
  {
    anchor: 'agent-mandates',
    eyebrow: 'Dashboard',
    title: 'Review active mandates',
    body: 'Review mandates and recent runs from this dashboard.',
  },
  {
    anchor: 'agent-new-mandate',
    eyebrow: 'Create',
    title: 'Open the guided composer',
    body: 'Use New mandate to open the guided composer.',
  },
  {
    anchor: 'agent-settings-tab',
    eyebrow: 'Settings',
    title: 'Switch to runner settings',
    body: 'Switch to Settings to manage external runners.',
    opensSettings: true,
  },
  {
    anchor: 'runner-bind',
    eyebrow: 'Runner',
    title: 'Bind your external runner',
    body: 'Bind an external runner before creating mandates.',
    opensSettings: true,
  },
  {
    anchor: 'runner-token',
    eyebrow: 'Token',
    title: 'Store the setup prompt',
    body: 'Copy and store the one-time runner setup prompt after binding.',
    opensSettings: true,
  },
];

export const AGENT_DASHBOARD_SIGNED_OUT_ONBOARDING_STEPS: AgentOnboardingTourStep[] = [
  {
    anchor: 'agent-dashboard',
    eyebrow: 'Agent',
    title: 'Sign in to manage mandates',
    body: 'Sign in to review and manage your Agent mandates. Use New mandate to open the guided composer.',
  },
  {
    anchor: 'agent-new-mandate',
    eyebrow: 'Create',
    title: 'Start guided creation',
    body: 'Use New mandate to open the guided composer.',
  },
];

export function AgentOnboardingTour({
  steps,
  storageKey,
  onOpenSettings,
}: {
  steps: AgentOnboardingTourStep[];
  storageKey: string;
  onOpenSettings: () => void;
}) {
  const getSnapshot = useCallback(
    () => getTourStorageSnapshot(storageKey),
    [storageKey],
  );
  const storedState = useSyncExternalStore(
    subscribeToTourStorage,
    getSnapshot,
    getServerTourStorageSnapshot,
  );
  const [manualOpen, setManualOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const activeStep = steps[Math.min(stepIndex, steps.length - 1)];
  const activeAnchor = activeStep?.anchor;
  const activeOpensSettings = activeStep?.opensSettings ?? false;
  const isLastStep = stepIndex === steps.length - 1;
  const open = steps.length > 0 && (manualOpen || storedState === 'new');

  useEffect(() => {
    if (open && activeOpensSettings) {
      onOpenSettings();
    }
  }, [activeOpensSettings, onOpenSettings, open]);

  useEffect(() => {
    if (!open || !activeAnchor) {
      return;
    }

    let animationFrame = 0;
    let revealTimer = 0;

    const updateTarget = () => {
      const target = document.querySelector<HTMLElement>(`[data-agent-tour="${activeAnchor}"]`);
      if (!target) {
        setTargetRect(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    const revealTarget = () => {
      const target = document.querySelector<HTMLElement>(`[data-agent-tour="${activeAnchor}"]`);
      target?.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      animationFrame = window.requestAnimationFrame(updateTarget);
    };

    revealTimer = window.setTimeout(revealTarget, activeOpensSettings ? 120 : 0);
    window.addEventListener('resize', updateTarget);
    window.addEventListener('scroll', updateTarget, true);

    return () => {
      window.clearTimeout(revealTimer);
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', updateTarget);
      window.removeEventListener('scroll', updateTarget, true);
    };
  }, [activeAnchor, activeOpensSettings, open]);

  const restart = useCallback(() => {
    setStepIndex(0);
    setManualOpen(true);
  }, []);

  const close = useCallback(() => {
    writeTourState(storageKey, 'dismissed');
    setManualOpen(false);
  }, [storageKey]);

  const done = useCallback(() => {
    writeTourState(storageKey, 'completed');
    setManualOpen(false);
  }, [storageKey]);

  const goBack = () => setStepIndex((value) => Math.max(0, value - 1));
  const goNext = () => setStepIndex((value) => Math.min(steps.length - 1, value + 1));

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={restart}>
        <HelpCircle className="size-3.5" />
        Guide
      </Button>

      {open ? (
        <>
          {targetRect ? <TourHighlight rect={targetRect} /> : null}
          <section
            role="dialog"
            aria-label="Agent onboarding guide"
            aria-live="polite"
            className="fixed bottom-20 right-4 z-[80] w-[min(360px,calc(100vw-2rem))] rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-2xl sm:bottom-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-mute)' }}>
                  {activeStep.eyebrow} · {stepIndex + 1}/{steps.length}
                </p>
                <h2 className="mt-1 text-[15px] font-semibold">{activeStep.title}</h2>
              </div>
              <Button type="button" size="icon-xs" variant="ghost" onClick={close} aria-label="Close guide">
                <X className="size-3.5" />
              </Button>
            </div>
            <p className="mt-2 text-[13px] leading-5" style={{ color: 'var(--text-soft)' }}>
              {activeStep.body}
            </p>
            {targetRect ? null : (
              <p className="mt-2 text-[12px]" style={{ color: 'var(--text-mute)' }}>
                This step appears when the matching panel is visible.
              </p>
            )}
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={close}>
                Close
              </Button>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={goBack} disabled={stepIndex === 0}>
                  <ChevronLeft className="size-3.5" />
                  Back
                </Button>
                {isLastStep ? (
                  <Button type="button" size="sm" onClick={done}>
                    <Check className="size-3.5" />
                    Done
                  </Button>
                ) : (
                  <Button type="button" size="sm" onClick={goNext}>
                    Next
                    <ChevronRight className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}

function TourHighlight({ rect }: { rect: TargetRect }) {
  const padding = 6;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-[70] rounded-[14px] border-2 border-[color:var(--ring)]"
      style={{
        top: Math.max(8, rect.top - padding),
        left: Math.max(8, rect.left - padding),
        width: Math.max(0, rect.width + padding * 2),
        height: Math.max(0, rect.height + padding * 2),
        boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.18)',
      }}
    />
  );
}

function hasStoredTourState(storageKey: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { status?: unknown };
    return parsed.status === 'dismissed' || parsed.status === 'completed';
  } catch {
    return false;
  }
}

function subscribeToTourStorage(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(TOUR_STORAGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(TOUR_STORAGE_EVENT, onStoreChange);
  };
}

function getTourStorageSnapshot(storageKey: string): 'stored' | 'new' {
  return hasStoredTourState(storageKey) ? 'stored' : 'new';
}

function getServerTourStorageSnapshot(): 'stored' {
  return 'stored';
}

function writeTourState(storageKey: string, status: StoredTourStatus) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: 2,
        status,
        updatedAt: new Date().toISOString(),
      }),
    );
    window.dispatchEvent(new Event(TOUR_STORAGE_EVENT));
  } catch {
    // Browser storage can be unavailable in private contexts; the tour should remain non-blocking.
  }
}
