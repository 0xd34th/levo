import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  AGENT_ADDRESS,
  buildConsumeAndAuthorizeTxMock,
  decryptWitnessForActionMock,
  devInspectTransactionBlockMock,
  getObjectMock,
  prismaMock,
  signTransactionAsAgentMock,
  txBuildMock,
  txSetGasOwnerMock,
  txSetSenderMock,
} = vi.hoisted(() => ({
  AGENT_ADDRESS: '0x1111111111111111111111111111111111111111111111111111111111111111',
  buildConsumeAndAuthorizeTxMock: vi.fn(),
  decryptWitnessForActionMock: vi.fn(),
  devInspectTransactionBlockMock: vi.fn(),
  getObjectMock: vi.fn(),
  prismaMock: {
    agentMandate: {
      findUnique: vi.fn(),
    },
    agentAction: {
      count: vi.fn(),
    },
    agentWitness: {
      findMany: vi.fn(),
    },
  },
  signTransactionAsAgentMock: vi.fn(),
  txBuildMock: vi.fn(),
  txSetGasOwnerMock: vi.fn(),
  txSetSenderMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/gas-station', () => ({ getGasStationKeypair: () => null }));
vi.mock('./kms', () => ({
  getAgentAddress: () => AGENT_ADDRESS,
  signTransactionAsAgent: signTransactionAsAgentMock,
}));
vi.mock('./seal-client', () => ({
  decryptWitnessForAction: decryptWitnessForActionMock,
}));
vi.mock('./sui-client', () => ({
  getAgentSuiClient: () => ({
    getObject: getObjectMock,
    devInspectTransactionBlock: devInspectTransactionBlockMock,
  }),
}));
vi.mock('./tx', () => ({
  buildConsumeAndAuthorizeTx: buildConsumeAndAuthorizeTxMock,
}));

const witnessStep = {
  id: 'witness-1',
  mandateId: 'mandate-1',
  chainIndex: 0,
  actionType: 8,
  coinType: '0x2::sui::SUI',
  amount: '100',
  target: '0x2222222222222222222222222222222222222222222222222222222222222222',
  currentCommit: '0x0102',
  nextCommit: '0x0304',
  approvalIdentity: '0x0a0b',
  encryptedObject: Uint8Array.from([1, 2, 3]),
  consumed: false,
  consumedAt: null,
  consumedTxDigest: null,
  createdAt: new Date('2026-05-20T00:00:00.000Z'),
};

const activeMandate = {
  id: 'mandate-1',
  xUserId: 'x-user',
  mandateObjectId: '0x3333333333333333333333333333333333333333333333333333333333333333',
  name: 'Live dry run test',
  actions: 8,
  coinLimits: [],
  periodMs: 86_400_000n,
  allowedTargets: [],
  expiryMs: 4_102_444_800_000n,
  metadata: {},
  status: 'ACTIVE',
  nonce: 1n,
  witnessCommit: '0x0102',
  createdTxDigest: 'create-digest',
  initTxDigest: 'init-digest',
  createdAt: new Date('2026-05-20T01:00:00.000Z'),
  updatedAt: new Date('2026-05-20T01:00:00.000Z'),
  revokedTxDigest: null,
  revokedAt: null,
  destroyedTxDigest: null,
  destroyedAt: null,
  agentWitnesses: [witnessStep],
};

describe('dryRunAgentMandate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildConsumeAndAuthorizeTxMock.mockImplementation(() => ({
      setSender: txSetSenderMock,
      setGasOwner: txSetGasOwnerMock,
      build: txBuildMock,
    }));
    txBuildMock.mockResolvedValue(Uint8Array.from([9, 9, 9]));
    signTransactionAsAgentMock.mockResolvedValue({ signature: 'agent-sig', bytes: 'tx-bytes' });
    decryptWitnessForActionMock.mockResolvedValue(Uint8Array.from([7, 7, 7, 7]));
    getObjectMock.mockResolvedValue({
      data: {
        content: {
          dataType: 'moveObject',
          fields: {
            witness_commit: [1, 2],
            agent: AGENT_ADDRESS,
          },
        },
      },
    });
    devInspectTransactionBlockMock.mockResolvedValue({
      effects: { status: { status: 'success' } },
    });
    prismaMock.agentAction.count.mockResolvedValue(0);
    prismaMock.agentWitness.findMany.mockResolvedValue([]);
    prismaMock.agentMandate.findUnique.mockImplementation((args: { include?: unknown }) => {
      if (args.include) {
        return Promise.resolve(activeMandate);
      }
      return Promise.resolve({
        nonce: 1n,
        witnessCommit: '0x0102',
        status: 'ACTIVE',
      });
    });
  });

  it('proves an executable mandate without writing AgentAction or consuming witness rows', async () => {
    const { dryRunAgentMandate } = await import('./executor-dry-run');

    const report = await dryRunAgentMandate({
      testCase: {
        id: 'active-manual-harvest',
        mandateId: 'mandate-1',
        expect: 'executable',
      },
      createdAfter: new Date('2026-05-20T00:00:00.000Z'),
    });

    expect(report.ok).toBe(true);
    expect(report.status).toBe('executable');
    expect(report.evidence.sealDecryptedBytes).toBe(4);
    expect(report.evidence.agentSignatureChecked).toBe(true);
    expect(report.evidence.devInspectStatus).toBe('success');
    expect(prismaMock.agentAction.count).toHaveBeenCalledTimes(2);
    expect(prismaMock.agentWitness.findMany).toHaveBeenCalledTimes(2);
  });

  it('stops paused mandates at the guard before Seal, signing, or devInspect', async () => {
    prismaMock.agentMandate.findUnique.mockImplementation((args: { include?: unknown }) => {
      if (args.include) {
        return Promise.resolve({
          ...activeMandate,
          status: 'PAUSED_BY_USER',
          agentWitnesses: [witnessStep],
        });
      }
      return Promise.resolve({
        nonce: 1n,
        witnessCommit: '0x0102',
        status: 'PAUSED_BY_USER',
      });
    });

    const { dryRunAgentMandate } = await import('./executor-dry-run');

    const report = await dryRunAgentMandate({
      testCase: {
        id: 'paused-blocked',
        mandateId: 'mandate-1',
        expect: 'blocked_paused',
      },
    });

    expect(report.ok).toBe(true);
    expect(report.status).toBe('blocked');
    expect(report.reason).toContain('PAUSED_BY_USER');
    expect(decryptWitnessForActionMock).not.toHaveBeenCalled();
    expect(signTransactionAsAgentMock).not.toHaveBeenCalled();
    expect(devInspectTransactionBlockMock).not.toHaveBeenCalled();
  });
});
