'use client';

import { useState, useSyncExternalStore } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AgentDashboard } from './AgentDashboard';
import { cn } from '@/lib/utils';

// Floating "Ask Agent" entry point mounted globally inside the (hub) layout.
// Hidden until the user is authenticated (no point showing it on /login flows).
// Opens the AgentDashboard slide-over on click.
export function FloatingAgentButton({ className }: { className?: string }) {
  const { authenticated, ready } = usePrivy();
  const [open, setOpen] = useState(false);

  const mounted = useMounted();

  if (!mounted || !ready || !authenticated) return null;

  return (
    <>
      <Button
        type="button"
        variant="default"
        onClick={() => setOpen(true)}
        aria-label="Open agent dashboard"
        className={cn(
          'fixed bottom-5 right-5 z-40 h-12 w-12 rounded-full p-0 shadow-lg sm:bottom-8 sm:right-8',
          className,
        )}
      >
        <Sparkles className="h-5 w-5" />
      </Button>
      <AgentDashboard open={open} onOpenChange={setOpen} />
    </>
  );
}

function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
