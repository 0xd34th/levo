'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthorizationSignature, useIdentityToken, usePrivy } from '@privy-io/react-auth';
import { Copy, Loader2, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  parsePrivyAuthorizationRequiredResponse,
  type PrivyAuthorizationRequest,
} from '@/lib/privy-authorization';
import { privyAuthenticatedFetch } from '@/lib/privy-fetch';

interface UserAgentRow {
  id: string;
  agentAddress: string;
  label: string;
  status: 'ACTIVE' | 'REVOKED';
  isDefault: boolean;
  hasRunnerToken: boolean;
  lastHeartbeatAt: string | null;
  runnerTokenRotatedAt: string | null;
}

interface AgentSettingsProps {
  onAgentsChanged?: () => void;
}

interface AgentBindingAuthorizationRequired {
  status: 'authorization_required';
  authorizationRequest: PrivyAuthorizationRequest;
  bindingPayloadBase64: string;
  bindingIntent: string;
}

export function AgentSettings({ onAgentsChanged }: AgentSettingsProps = {}) {
  const { getAccessToken } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { generateAuthorizationSignature } = useAuthorizationSignature();
  const [agents, setAgents] = useState<UserAgentRow[]>([]);
  const [agentAddress, setAgentAddress] = useState('');
  const [label, setLabel] = useState('External agent');
  const [runnerToken, setRunnerToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authedFetch = useCallback(
    (url: string, init?: RequestInit) =>
      privyAuthenticatedFetch(getAccessToken, url, init, { identityToken }),
    [getAccessToken, identityToken],
  );

  const reload = useCallback(async () => {
    const res = await authedFetch('/api/v1/agent/user-agents', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Agent list failed with HTTP ${res.status}`);
    const data = (await res.json()) as { agents: UserAgentRow[] };
    setAgents(data.agents);
  }, [authedFetch]);

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load agents'));
  }, [reload]);

  const register = async () => {
    setBusy('register');
    setError(null);
    setRunnerToken(null);
    try {
      const first = await authedFetch('/api/v1/agent/user-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentAddress, label }),
      });
      const firstData = await readJson(first);
      const authorizationRequired = parseAgentBindingAuthorizationRequired(firstData);
      if (!authorizationRequired) {
        throw new Error('Agent binding authorization was not returned. Please try again.');
      }

      const { signature } = await generateAuthorizationSignature(
        authorizationRequired.authorizationRequest,
      );

      const second = await authedFetch('/api/v1/agent/user-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentAddress,
          label,
          authorizationSignature: signature,
          bindingPayloadBase64: authorizationRequired.bindingPayloadBase64,
          bindingIntent: authorizationRequired.bindingIntent,
        }),
      });
      const data = (await readJson(second)) as { runnerToken: string };
      setRunnerToken(data.runnerToken);
      await reload();
      onAgentsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register agent');
    } finally {
      setBusy(null);
    }
  };

  const rotate = async (id: string) => {
    setBusy(`rotate:${id}`);
    setError(null);
    try {
      const res = await authedFetch(`/api/v1/agent/user-agents/${id}/token`, { method: 'POST' });
      const data = (await readJson(res)) as { runnerToken: string };
      setRunnerToken(data.runnerToken);
      await reload();
      onAgentsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rotate token');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm('Revoke this external agent and pause its active mandates?')) return;
    setBusy(`revoke:${id}`);
    setError(null);
    try {
      const res = await authedFetch(`/api/v1/agent/user-agents/${id}/revoke`, { method: 'POST' });
      await readJson(res);
      await reload();
      onAgentsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke agent');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto space-y-4">
      <section className="rounded-[12px] bg-[color:var(--surface)] p-3 ring-1 ring-[color:var(--border)]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4" />
          <h2 className="text-[14px] font-semibold">Bind external agent</h2>
        </div>
        <div className="mt-3 grid gap-3">
          <Field label="Agent address" value={agentAddress} onChange={setAgentAddress} placeholder="0x..." />
          <Field label="Label" value={label} onChange={setLabel} placeholder="Home runner" />
          <Button type="button" size="sm" onClick={register} disabled={busy !== null || !agentAddress.trim()}>
            {busy === 'register' && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Bind external agent
          </Button>
        </div>
      </section>

      {runnerToken && (
        <section className="rounded-[12px] bg-background p-3 ring-1 ring-[color:var(--border)]">
          <p className="text-[13px] font-medium">Runner token</p>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--text-soft)' }}>
            Shown once. Store it in your runner environment.
          </p>
          <div className="mt-2 flex gap-2">
            <code className="min-w-0 flex-1 overflow-auto rounded-[8px] bg-[color:var(--surface)] px-2 py-2 text-[11px]">
              {runnerToken}
            </code>
            <Button type="button" size="icon-sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(runnerToken)}>
              <Copy className="size-3.5" />
            </Button>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-[14px] font-semibold">Agents</h2>
        {agents.length === 0 ? (
          <p className="text-[13px]" style={{ color: 'var(--text-soft)' }}>No external agent is bound.</p>
        ) : (
          agents.map((agent) => (
            <div key={agent.id} className="rounded-[12px] bg-[color:var(--surface)] p-3 ring-1 ring-[color:var(--border)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{agent.label} {agent.isDefault ? '(default)' : ''}</p>
                  <p className="truncate font-mono text-[11px]" style={{ color: 'var(--text-soft)' }}>{agent.agentAddress}</p>
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--text-soft)' }}>
                    Last heartbeat: {agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt).toLocaleString() : 'never'}
                  </p>
                </div>
                <span className="rounded-full px-2 py-0.5 text-[11px] ring-1 ring-[color:var(--border)]">
                  {agent.status}
                </span>
              </div>
              {agent.status === 'ACTIVE' && (
                <div className="mt-3 flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => rotate(agent.id)} disabled={busy !== null}>
                    {busy === `rotate:${agent.id}` ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 size-3.5" />}
                    Rotate token
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => revoke(agent.id)} disabled={busy !== null}>
                    {busy === `revoke:${agent.id}` ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Trash2 className="mr-1.5 size-3.5" />}
                    Revoke
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </section>

      {error && <p className="rounded-[10px] bg-background px-3 py-2 text-[12px] ring-1 ring-[color:var(--border)]" style={{ color: 'var(--down)' }}>{error}</p>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px]" style={{ color: 'var(--text-soft)' }}>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

async function readJson(res: Response): Promise<unknown> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Request failed with HTTP ${res.status}`,
    );
  }
  return data;
}

function parseAgentBindingAuthorizationRequired(
  payload: unknown,
): AgentBindingAuthorizationRequired | null {
  const authorizationRequired = parsePrivyAuthorizationRequiredResponse(payload);
  if (
    authorizationRequired &&
    payload &&
    typeof payload === 'object' &&
    'bindingPayloadBase64' in payload &&
    typeof (payload as { bindingPayloadBase64: unknown }).bindingPayloadBase64 === 'string' &&
    'bindingIntent' in payload &&
    typeof (payload as { bindingIntent: unknown }).bindingIntent === 'string'
  ) {
    return {
      ...authorizationRequired,
      bindingPayloadBase64: (payload as { bindingPayloadBase64: string }).bindingPayloadBase64,
      bindingIntent: (payload as { bindingIntent: string }).bindingIntent,
    };
  }
  return null;
}
