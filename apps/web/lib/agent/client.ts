'use client';

import {
  parsePrivyAuthorizationRequiredResponse,
  type PrivyAuthorizationRequest,
} from '@/lib/privy-authorization';
import type { AgentMandateConfig } from '@/lib/agent/config';
import {
  privyAuthenticatedFetch,
  type GetPrivyAccessToken,
} from '@/lib/privy-fetch';

// Mirrors lib/agent/types.ts shapes but defined here so this file is import-safe
// from React components ("use client" boundary) without dragging in server-only
// modules (prisma, sui-client, etc.).

export type MandateRowStatus =
  | 'ACTIVE'
  | 'REVOKED'
  | 'EXPIRED'
  | 'PAUSED_BY_USER'
  | 'LEGACY_PAUSED'
  | 'DESTROYED';

export interface MandateSummary {
  id: string;
  userAgentId: string | null;
  agentAddress: string;
  mandateObjectId: string;
  name: string;
  actions: number;
  coinLimits: unknown;
  periodMs: string;
  allowedTargets: unknown;
  expiryMs: string;
  metadata: unknown;
  status: MandateRowStatus;
  nonce: string;
  witnessCommit: string | null;
  createdTxDigest: string;
  initTxDigest: string | null;
  revokedTxDigest: string | null;
  revokedAt: string | null;
  destroyedTxDigest: string | null;
  destroyedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentActionRow {
  id: string;
  mandateId: string;
  actionType: number;
  coinType: string;
  amount: string;
  target: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'BLOCKED_BY_SEAL';
  txDigest: string | null;
  trigger: 'CHAT' | 'SCHEDULED' | 'EVENT';
  sealApproved: boolean;
  errorReason: string | null;
  nonceAfter: string | null;
  commitBefore: string | null;
  commitAfter: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

export interface ListMandatesResponse {
  mandates: MandateSummary[];
}

export interface MandateDetailResponse {
  mandate: MandateSummary;
  actions: AgentActionRow[];
}

export type CreateConfirmedResponse = {
  status: 'confirmed';
  txDigest: string;
  mandateRowId: string;
  mandateObjectId: string;
  witnessChainLength: number;
  initAuthorizationRequest: PrivyAuthorizationRequest;
  initTxBytesBase64: string;
  initTxIntent: string;
};

export type SimpleConfirmedResponse = { status: 'confirmed'; txDigest: string };

export type InitializeConfirmedResponse = {
  status: 'confirmed';
  txDigest: string;
  witnessCommit: string;
};

export type ExecuteResponse =
  | {
      status: 'queued';
      job: { id: string };
    }
  | {
      status: 'confirmed';
      txDigest: string;
      actionId: string;
      witnessId: string;
      nonceAfter: number | string;
    }
  | { status: 'blocked_by_seal'; reason: string; actionId: string }
  | { status: 'failed'; reason: string; actionId: string }
  | { status: 'no_steps_pending'; mandateId: string };

// ---------- Generic helpers ----------

interface AuthContext {
  getAccessToken: GetPrivyAccessToken;
  identityToken?: string | null;
  generateAuthorizationSignature: (
    request: PrivyAuthorizationRequest,
  ) => Promise<{ signature: string }>;
}

async function postJson<T>(
  ctx: { getAccessToken: GetPrivyAccessToken; identityToken?: string | null },
  url: string,
  body: unknown,
): Promise<T> {
  const res = await privyAuthenticatedFetch(
    ctx.getAccessToken,
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { identityToken: ctx.identityToken },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(
      (data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : null) ?? `${url} failed with HTTP ${res.status}`,
    );
  }
  return res.json();
}

// 2-step pattern: first call returns auth_required; user signs; second call returns confirmed.
// Used by create / initialize / revoke / destroy routes.
async function twoStepPrivy<TConfirmed>(args: {
  ctx: AuthContext;
  url: string;
  prepareBody: unknown;
}): Promise<TConfirmed> {
  // 1st request: server returns auth request + txBytes.
  const first = await postJson<unknown>(args.ctx, args.url, args.prepareBody);
  const authRequired = parsePrivyAuthorizationRequiredResponse(first);
  if (!authRequired) {
    // Server returned a confirmed result directly (shouldn't happen on first call,
    // but handle defensively for routes that may shortcut later).
    return first as TConfirmed;
  }
  const { signature } = await args.ctx.generateAuthorizationSignature(
    authRequired.authorizationRequest,
  );
  const txBytesBase64 = extractTxBytesBase64(first);
  const txIntent = extractTxIntent(first);
  // 2nd request: include signature + txBytes round-trip so server can submit.
  return postJson<TConfirmed>(args.ctx, args.url, {
    ...(args.prepareBody as Record<string, unknown>),
    authorizationSignature: signature,
    txBytesBase64,
    txIntent,
  });
}

function extractTxBytesBase64(payload: unknown): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'txBytesBase64' in payload &&
    typeof (payload as { txBytesBase64: unknown }).txBytesBase64 === 'string'
  ) {
    return (payload as { txBytesBase64: string }).txBytesBase64;
  }
  throw new Error('Server response missing txBytesBase64');
}

function extractTxIntent(payload: unknown): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'txIntent' in payload &&
    typeof (payload as { txIntent: unknown }).txIntent === 'string'
  ) {
    return (payload as { txIntent: string }).txIntent;
  }
  throw new Error('Server response missing txIntent');
}

// ---------- Public API ----------

export async function fetchMandates(
  getAccessToken: GetPrivyAccessToken,
  identityToken?: string | null,
): Promise<MandateSummary[]> {
  const res = await privyAuthenticatedFetch(
    getAccessToken,
    '/api/v1/agent/mandate/list',
    { method: 'GET' },
    { identityToken },
  );
  if (!res.ok) throw new Error(`list failed: HTTP ${res.status}`);
  const data: ListMandatesResponse = await res.json();
  return data.mandates;
}

export async function fetchAgentConfig(
  getAccessToken: GetPrivyAccessToken,
  identityToken?: string | null,
): Promise<AgentMandateConfig> {
  const res = await privyAuthenticatedFetch(
    getAccessToken,
    '/api/v1/agent/config',
    { method: 'GET', cache: 'no-store' },
    { identityToken },
  );
  if (!res.ok) throw new Error(`agent config failed: HTTP ${res.status}`);
  return res.json();
}

export async function fetchMandate(
  getAccessToken: GetPrivyAccessToken,
  identityToken: string | null,
  id: string,
): Promise<MandateDetailResponse> {
  const res = await privyAuthenticatedFetch(
    getAccessToken,
    `/api/v1/agent/mandate/${id}`,
    { method: 'GET' },
    { identityToken },
  );
  if (!res.ok) throw new Error(`get mandate failed: HTTP ${res.status}`);
  return res.json();
}

export interface CreateMandatePayload {
  spec: {
    agent: string;
    actions: number;
    coinLimits: Array<{ coinType: string; perTxCap: string; periodCap: string }>;
    periodMs: string;
    allowedTargets: string[];
    expiryMs: string;
    metadata?: Record<string, string>;
  };
  plan: Array<{
    actionType: number;
    coinType: string;
    target: string;
    amount: string;
  }>;
  metadataName?: string;
}

export async function createMandate(
  ctx: AuthContext,
  payload: CreateMandatePayload,
): Promise<CreateConfirmedResponse> {
  return twoStepPrivy<CreateConfirmedResponse>({
    ctx,
    url: '/api/v1/agent/mandate/create',
    prepareBody: payload,
  });
}

// initialize is special: server pre-built the init tx during create and returned it
// + the auth request in the create response. The client can fast-path by passing both
// straight to /initialize without an extra "prepare" round-trip.
export async function initializeMandateWithPrebuilt(
  ctx: AuthContext,
  args: {
    mandateRowId: string;
    initAuthorizationRequest: PrivyAuthorizationRequest;
    initTxBytesBase64: string;
    initTxIntent: string;
  },
): Promise<InitializeConfirmedResponse> {
  const { signature } = await ctx.generateAuthorizationSignature(
    args.initAuthorizationRequest,
  );
  return postJson<InitializeConfirmedResponse>(
    ctx,
    `/api/v1/agent/mandate/${args.mandateRowId}/initialize`,
    {
      authorizationSignature: signature,
      txBytesBase64: args.initTxBytesBase64,
      txIntent: args.initTxIntent,
    },
  );
}

// Fallback: server rebuilds the init tx (e.g., after a page reload that lost the
// in-memory init tx). Uses the standard 2-step pattern.
export async function initializeMandate(
  ctx: AuthContext,
  mandateRowId: string,
): Promise<InitializeConfirmedResponse> {
  return twoStepPrivy<InitializeConfirmedResponse>({
    ctx,
    url: `/api/v1/agent/mandate/${mandateRowId}/initialize`,
    prepareBody: {},
  });
}

export async function executeMandate(
  ctx: Pick<AuthContext, 'getAccessToken' | 'identityToken'>,
  mandateRowId: string,
): Promise<ExecuteResponse> {
  return postJson<ExecuteResponse>(
    ctx,
    `/api/v1/agent/mandate/${mandateRowId}/execute`,
    {},
  );
}

export async function pauseMandate(
  ctx: Pick<AuthContext, 'getAccessToken' | 'identityToken'>,
  mandateRowId: string,
): Promise<{ status: 'paused'; mandate: MandateSummary }> {
  return postJson<{ status: 'paused'; mandate: MandateSummary }>(
    ctx,
    `/api/v1/agent/mandate/${mandateRowId}/pause`,
    {},
  );
}

export async function resumeMandate(
  ctx: Pick<AuthContext, 'getAccessToken' | 'identityToken'>,
  mandateRowId: string,
): Promise<{ status: 'resumed'; mandate: MandateSummary }> {
  return postJson<{ status: 'resumed'; mandate: MandateSummary }>(
    ctx,
    `/api/v1/agent/mandate/${mandateRowId}/resume`,
    {},
  );
}

export async function revokeMandate(
  ctx: AuthContext,
  mandateRowId: string,
): Promise<SimpleConfirmedResponse> {
  return twoStepPrivy<SimpleConfirmedResponse>({
    ctx,
    url: `/api/v1/agent/mandate/${mandateRowId}/revoke`,
    prepareBody: {},
  });
}

export async function destroyMandate(
  ctx: AuthContext,
  mandateRowId: string,
): Promise<SimpleConfirmedResponse> {
  return twoStepPrivy<SimpleConfirmedResponse>({
    ctx,
    url: `/api/v1/agent/mandate/${mandateRowId}/destroy`,
    prepareBody: {},
  });
}

// ---------- Display helpers (no React deps) ----------

export const ACTION_LABEL: Record<number, string> = {
  1: 'SEND',
  2: 'EARN_DEPOSIT',
  4: 'EARN_WITHDRAW',
  8: 'EARN_HARVEST',
  16: 'SWAP',
  32: 'PULL',
};

export function describeActions(bitfield: number): string {
  return Object.entries(ACTION_LABEL)
    .filter(([k]) => (bitfield & Number(k)) !== 0)
    .map(([, v]) => v)
    .join(' | ') || `0x${bitfield.toString(16)}`;
}

export function statusLabel(status: MandateRowStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'REVOKED':
      return 'Revoked';
    case 'EXPIRED':
      return 'Expired';
    case 'PAUSED_BY_USER':
      return 'Paused';
    case 'LEGACY_PAUSED':
      return 'Legacy paused';
    case 'DESTROYED':
      return 'Destroyed';
  }
}
