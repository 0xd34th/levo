'use client';

import { Check, ChevronRight, LoaderCircle, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ClaimStepStatus = 'complete' | 'current' | 'upcoming';

export interface ClaimStep {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  status: ClaimStepStatus;
}

interface ClaimStepperProps {
  steps: ClaimStep[];
  loadingStepId?: string | null;
  onStepAction: (id: string) => void;
}

export function ClaimStepper({
  steps,
  loadingStepId = null,
  onStepAction,
}: ClaimStepperProps) {
  return (
    <div className="space-y-4">
      {steps.map((step, index) => {
        const isCurrent = step.status === 'current';
        const isComplete = step.status === 'complete';
        const isUpcoming = step.status === 'upcoming';

        return (
          <div
            key={step.id}
            className={cn(
              'rounded-[26px] border p-4 transition-colors',
              isCurrent
                ? 'border-primary/30 bg-primary/10'
                : 'border-border/70 bg-secondary/60 dark:border-white/10 dark:bg-white/4',
            )}
          >
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'flex size-10 items-center justify-center rounded-full border text-sm font-semibold',
                    isComplete
                      ? 'border-accent bg-accent text-accent-foreground'
                      : isCurrent
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border/70 bg-background/80 text-muted-foreground dark:border-white/10 dark:bg-white/5',
                  )}
                >
                  {isComplete ? <Check className="size-4" /> : index + 1}
                </span>
                {index < steps.length - 1 ? (
                  <span className="mt-2 h-full w-px bg-border dark:bg-white/10" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold tracking-[-0.03em]">{step.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                  </div>

                  <Button
                    className="rounded-full"
                    disabled={isUpcoming || isComplete || loadingStepId === step.id}
                    variant={isCurrent ? 'default' : 'outline'}
                    onClick={() => onStepAction(step.id)}
                  >
                    {loadingStepId === step.id ? (
                      <>
                        <LoaderCircle className="size-4 animate-spin" />
                        Working
                      </>
                    ) : isComplete ? (
                      <>
                        Done
                        <Check className="size-4" />
                      </>
                    ) : (
                      <>
                        {step.actionLabel}
                        {step.id === 'connect' ? (
                          <Wallet className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
