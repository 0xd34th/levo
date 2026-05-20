'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  Clock3,
  CopyPlus,
  Navigation,
  Search,
  Send,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const commands = [
  {
    label: 'Send payment',
    description: 'Open the send flow',
    href: '/send',
    icon: Send,
    keywords: ['send', 'pay', 'payment'],
  },
  {
    label: 'Lookup recipient',
    description: 'Find a handle or wallet',
    href: '/lookup',
    icon: Search,
    keywords: ['lookup', 'search', 'recipient'],
  },
  {
    label: 'New mandate',
    description: 'Draft an agent mandate',
    href: '/agent/new',
    icon: Bot,
    keywords: ['agent', 'mandate', 'automation'],
  },
  {
    label: 'Repeat recent payment',
    description: 'Open Activity to pick a transaction',
    href: '/activity',
    icon: CopyPlus,
    keywords: ['repeat', 'again', 'recent'],
  },
  {
    label: 'Agent mandates',
    description: 'Review active and paused mandates',
    href: '/agent',
    icon: Clock3,
    keywords: ['mandates', 'status', 'runs'],
  },
];

export function GlobalCommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((command) =>
      [command.label, command.description, ...command.keywords]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [query]);

  const go = (href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-3 p-4 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Command</DialogTitle>
          <DialogDescription>
            Navigation and setup shortcuts. Money movement opens a form or confirmation first.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search send, lookup, new mandate..."
        />
        <div className="max-h-[360px] overflow-y-auto">
          {visible.map((command) => {
            const Icon = command.icon;
            return (
              <button
                type="button"
                key={command.label}
                className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-left hover:bg-[color:var(--surface)]"
                onClick={() => go(command.href)}
              >
                <span className="flex size-8 items-center justify-center rounded-[8px] bg-[color:var(--surface)]">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium">{command.label}</span>
                  <span className="block text-[12px]" style={{ color: 'var(--text-soft)' }}>
                    {command.description}
                  </span>
                </span>
                <Navigation className="size-3.5" style={{ color: 'var(--text-mute)' }} />
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
