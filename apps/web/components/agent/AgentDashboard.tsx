'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useIdentityToken, usePrivy } from '@privy-io/react-auth';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Plus, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  fetchMandates,
  type MandateSummary,
} from '@/lib/agent/client';
import { cn } from '@/lib/utils';
import { useXSignIn } from '@/lib/use-x-sign-in';
import { AgentChatPanel } from './AgentChatPanel';
import { AgentSettings } from './AgentSettings';
import { MandateCard } from './MandateCard';
import { MandateCreateForm } from './MandateCreateForm';

interface AgentDashboardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type View = 'chat' | 'list' | 'create' | 'settings';

const TAB_LABELS: Record<View, string> = {
  chat: 'Chat',
  list: 'Mandates',
  create: 'Create',
  settings: 'Settings',
};

export function AgentDashboard({ open, onOpenChange }: AgentDashboardProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            'fixed inset-0 z-50 bg-black/35',
            'duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
          )}
        />
        <DialogPrimitive.Popup
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-background ring-1 ring-[color:var(--border)] outline-none',
            'data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right duration-200',
          )}
        >
          <AgentWorkspace
            headerAction={
              <DialogPrimitive.Close
                render={
                  <Button variant="ghost" size="icon-sm" aria-label="Close">
                    <XIcon className="h-4 w-4" />
                  </Button>
                }
              />
            }
          />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface AgentWorkspaceProps {
  className?: string;
  headerAction?: ReactNode;
  initialView?: View;
}

export function AgentWorkspace({ className, headerAction, initialView = 'chat' }: AgentWorkspaceProps) {
  const { getAccessToken, ready, authenticated } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { signIn: signInWithX } = useXSignIn();
  const [view, setView] = useState<View>(initialView);
  const [mandates, setMandates] = useState<MandateSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!ready || !authenticated) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchMandates(getAccessToken, identityToken);
      setMandates(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load mandates');
    } finally {
      setLoading(false);
    }
  }, [authenticated, getAccessToken, identityToken, ready]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!ready) {
    return (
      <section
        className={cn(
          'flex min-h-[360px] flex-col items-center justify-center px-5 py-10',
          className,
        )}
      >
        <p className="text-[13px]" style={{ color: 'var(--text-soft)' }}>
          Loading agent…
        </p>
      </section>
    );
  }

  if (!authenticated) {
    return (
      <section
        className={cn('flex min-h-[360px] flex-col px-5 py-6', className)}
      >
        <header className="border-b border-[color:var(--border)] pb-4">
          <h1 className="text-[19px] font-semibold leading-tight tracking-[-0.01em]">
            Agent
          </h1>
          <p
            className="mt-1 text-[13px] leading-[1.4]"
            style={{ color: 'var(--text-soft)' }}
          >
            Sign in to create and manage Levo agent mandates.
          </p>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <p className="text-[14px] font-medium">AI agent requires sign-in</p>
          <p
            className="mt-1 max-w-xs text-[13px]"
            style={{ color: 'var(--text-soft)' }}
          >
            Your X session is used to load your wallet and authorize agent actions.
          </p>
          <Button
            type="button"
            className="mt-5 rounded-full px-5"
            onClick={signInWithX}
          >
            Sign in with X
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className={cn('flex min-h-[520px] flex-col bg-background', className)}>
      <header className="flex items-center justify-between gap-4 border-b border-[color:var(--border)] px-5 py-4">
        <div>
          <h1 className="text-[17px] font-semibold leading-tight tracking-[-0.01em]">
            Agent
          </h1>
          <p
            className="text-[13px] leading-[1.4]"
            style={{ color: 'var(--text-soft)' }}
          >
            {TAB_LABELS[view]}
          </p>
        </div>
        {headerAction}
      </header>

      <nav className="flex gap-1 border-b border-[color:var(--border)] px-3 py-2 text-[12px]">
        {(['chat', 'list', 'create', 'settings'] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn(
              'rounded-full px-3 py-1 transition',
              view === v
                ? 'bg-foreground text-background'
                : 'text-[color:var(--text-soft)] hover:bg-[color:var(--surface)]',
            )}
          >
            {TAB_LABELS[v]}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-hidden px-5 py-4">
        {view === 'chat' ? (
          <AgentChatPanel onMandateCreated={reload} />
        ) : view === 'list' ? (
          <div className="h-full overflow-y-auto">
            <ListView
              loading={loading}
              error={error}
              mandates={mandates}
              onChanged={reload}
            />
          </div>
        ) : view === 'create' ? (
          <div className="h-full overflow-y-auto">
            <MandateCreateForm
              onCancel={() => setView('list')}
              onCreated={() => {
                setView('list');
                void reload();
              }}
            />
          </div>
        ) : (
          <AgentSettings />
        )}
      </div>

      {view === 'list' && (
        <footer className="border-t border-[color:var(--border)] px-5 py-3">
          <Button
            type="button"
            variant="default"
            className="w-full"
            onClick={() => setView('create')}
          >
            <Plus className="mr-2 h-4 w-4" />
            New mandate
          </Button>
        </footer>
      )}
    </section>
  );
}

function ListView({
  loading,
  error,
  mandates,
  onChanged,
}: {
  loading: boolean;
  error: string | null;
  mandates: MandateSummary[] | null;
  onChanged: () => void | Promise<void>;
}) {
  if (error) {
    return (
      <p className="rounded-[12px] bg-[color:var(--surface)] px-3 py-2 text-[13px]" style={{ color: 'var(--down)' }}>
        {error}
      </p>
    );
  }
  if (mandates === null && loading) {
    return <p className="text-[13px]" style={{ color: 'var(--text-soft)' }}>Loading…</p>;
  }
  if (!mandates || mandates.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-12 text-center">
        <p className="text-[14px] font-medium">No mandates yet</p>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--text-soft)' }}>
          Use “New mandate” to authorize an agent.
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {mandates.map((m) => (
        <li key={m.id}>
          <MandateCard mandate={m} onChanged={onChanged} />
        </li>
      ))}
    </ul>
  );
}
