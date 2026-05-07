/**
 * PTB → 自然语言反编译。
 * Sui 上没人做得好；这是 aisui 的杀手级差异化点。
 */
import type { SuiTransactionBlockResponse } from "@mysten/sui/jsonRpc";

export interface ExplainedTx {
  digest: string;
  status: "success" | "failure" | "unknown";
  errorMessage?: string;
  timestamp?: number;
  sender: string;
  gasFeeSui?: number;
  summary: string;
  steps: ExplainedStep[];
  balanceChanges: BalanceChange[];
  objectChanges: ObjectChange[];
}

export interface ExplainedStep {
  index: number;
  kind: "MoveCall" | "TransferObjects" | "SplitCoins" | "MergeCoins" | "Publish" | "Upgrade" | "MakeMoveVec" | "Other";
  description: string;
  module?: string;
  function?: string;
  package?: string;
}

export interface BalanceChange {
  address: string;
  coinType: string;
  symbol?: string;
  amount: string;
  direction: "in" | "out";
}

export interface ObjectChange {
  kind: "created" | "mutated" | "deleted" | "transferred" | "wrapped" | "unwrapped" | "published";
  type?: string;
  objectId?: string;
  packageId?: string;
}

const KNOWN_PROTOCOLS: Record<string, string> = {
  "0x2": "Sui Framework",
  "0x3": "Sui System",
  "0x1": "Move Stdlib",
  "0xdee9": "DeepBook",
  "0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb": "Cetus",
  "0xa0eba10b173538c8fecca1dff298e488402cc9ff374f8a12ca7758eebe830b66": "Scallop",
  "0xefe170ec0be4d762196bedecd7a065816576198a6527c99282a2551aaa7da38c": "Navi",
  "0x0e90fcdf4ff85c5cf8e4eb20c0b7c6d3e35f2a3c8e0f7f1d2a8f9b1d9c6c1ad9": "Suilend",
  "0xc4049b2d1cc0f6e017fda8260e4377cecd236bd7f56a54fee120816e3c62c5e8": "Aftermath",
};

const KNOWN_MODULES: Record<string, string> = {
  "pool::swap": "swap on a pool",
  "router::swap": "route swap via router",
  "router::swap_exact_input": "exact-input swap via router",
  "lending::supply": "supply to lending market",
  "lending::withdraw": "withdraw from lending market",
  "lending::borrow": "borrow from lending market",
  "lending::repay": "repay borrow",
  "staking::request_add_stake": "stake SUI",
  "staking::request_withdraw_stake": "unstake SUI",
  "kiosk::list": "list NFT in kiosk",
  "kiosk::purchase": "purchase NFT from kiosk",
  "transfer::public_transfer": "transfer object",
  "coin::split": "split coin",
  "coin::join": "merge coins",
};

export function explainTx(tx: SuiTransactionBlockResponse): ExplainedTx {
  const sender =
    tx.transaction?.data?.sender ??
    (typeof tx.transaction === "object" && tx.transaction !== null && "sender" in tx.transaction
      ? String((tx.transaction as { sender?: string }).sender ?? "")
      : "");

  const status: ExplainedTx["status"] =
    tx.effects?.status?.status === "success"
      ? "success"
      : tx.effects?.status?.status === "failure"
        ? "failure"
        : "unknown";

  const errorMessage = tx.effects?.status?.error;

  const gasUsed = tx.effects?.gasUsed;
  const gasFeeMist = gasUsed
    ? BigInt(gasUsed.computationCost ?? 0) +
      BigInt(gasUsed.storageCost ?? 0) -
      BigInt(gasUsed.storageRebate ?? 0)
    : 0n;
  const gasFeeSui = Number(gasFeeMist) / 1_000_000_000;

  const txData = tx.transaction?.data;
  const txKind =
    txData?.transaction && "kind" in txData.transaction ? txData.transaction : null;
  const transactions =
    txKind && "transactions" in txKind ? (txKind.transactions ?? []) : [];

  const steps: ExplainedStep[] = transactions.map((cmd, index) => describeCommand(cmd, index));

  const balanceChanges: BalanceChange[] = (tx.balanceChanges ?? []).map((b) => {
    const owner =
      typeof b.owner === "string"
        ? b.owner
        : "AddressOwner" in b.owner
          ? b.owner.AddressOwner
          : "ObjectOwner" in b.owner
            ? b.owner.ObjectOwner
            : "Shared";
    const amount = BigInt(b.amount);
    return {
      address: owner,
      coinType: b.coinType,
      symbol: shortType(b.coinType),
      amount: b.amount,
      direction: amount >= 0n ? "in" : "out",
    };
  });

  const objectChanges: ObjectChange[] = (tx.objectChanges ?? []).map((o) => {
    const kind =
      o.type === "created"
        ? "created"
        : o.type === "mutated"
          ? "mutated"
          : o.type === "deleted"
            ? "deleted"
            : o.type === "transferred"
              ? "transferred"
              : o.type === "wrapped"
                ? "wrapped"
                : o.type === "published"
                  ? "published"
                  : "mutated";
    return {
      kind: kind as ObjectChange["kind"],
      type: "objectType" in o ? o.objectType : undefined,
      objectId: "objectId" in o ? o.objectId : undefined,
      packageId: "packageId" in o ? o.packageId : undefined,
    };
  });

  const summary = buildSummary(steps, balanceChanges, sender, status);

  return {
    digest: tx.digest,
    status,
    errorMessage,
    timestamp: tx.timestampMs ? Number(tx.timestampMs) : undefined,
    sender,
    gasFeeSui,
    summary,
    steps,
    balanceChanges,
    objectChanges,
  };
}

function describeCommand(cmd: unknown, index: number): ExplainedStep {
  if (typeof cmd !== "object" || cmd === null) {
    return { index, kind: "Other", description: "unknown command" };
  }
  const obj = cmd as Record<string, unknown>;
  if ("MoveCall" in obj) {
    const mc = obj.MoveCall as { package?: string; module?: string; function?: string };
    const pkg = mc.package ?? "";
    const mod = mc.module ?? "";
    const fn = mc.function ?? "";
    const protocol = KNOWN_PROTOCOLS[pkg] ?? `${pkg.slice(0, 6)}…`;
    const moduleHuman = KNOWN_MODULES[`${mod}::${fn}`] ?? `${mod}::${fn}`;
    return {
      index,
      kind: "MoveCall",
      description: `${protocol} — ${moduleHuman}`,
      module: mod,
      function: fn,
      package: pkg,
    };
  }
  if ("TransferObjects" in obj) {
    return { index, kind: "TransferObjects", description: "transfer object(s)" };
  }
  if ("SplitCoins" in obj) {
    return { index, kind: "SplitCoins", description: "split coin into amounts" };
  }
  if ("MergeCoins" in obj) {
    return { index, kind: "MergeCoins", description: "merge coins" };
  }
  if ("Publish" in obj) {
    return { index, kind: "Publish", description: "publish new package" };
  }
  if ("Upgrade" in obj) {
    return { index, kind: "Upgrade", description: "upgrade package" };
  }
  if ("MakeMoveVec" in obj) {
    return { index, kind: "MakeMoveVec", description: "build move vector" };
  }
  return { index, kind: "Other", description: "command" };
}

function buildSummary(
  steps: ExplainedStep[],
  changes: BalanceChange[],
  sender: string,
  status: ExplainedTx["status"],
): string {
  if (status === "failure") return `Transaction failed before completing.`;

  const senderInflow = changes.filter((c) => c.address === sender && c.direction === "in");
  const senderOutflow = changes.filter((c) => c.address === sender && c.direction === "out");

  const swapStep = steps.find((s) => /swap/i.test(s.description));
  if (swapStep && senderOutflow.length > 0 && senderInflow.length > 0) {
    const out = senderOutflow[0];
    const incoming = senderInflow[0];
    return `Swapped ${shortType(out.coinType)} → ${shortType(incoming.coinType)} via ${swapStep.description}.`;
  }
  if (steps.some((s) => s.kind === "TransferObjects")) {
    if (senderOutflow.length > 0) {
      return `Transferred ${senderOutflow.map((c) => shortType(c.coinType)).join(", ")}.`;
    }
    return "Transferred objects between addresses.";
  }
  if (steps.some((s) => s.description.includes("stake"))) {
    return "Staked SUI with a validator.";
  }
  if (steps.some((s) => s.description.includes("supply"))) {
    return "Supplied assets into a lending protocol.";
  }
  if (steps.length === 0) return "No-op transaction.";
  return `${steps.length} command(s): ${steps[0].description}${steps.length > 1 ? ` … (+${steps.length - 1} more)` : ""}.`;
}

export function shortType(coinType: string): string {
  // 0x2::sui::SUI → SUI; 0x…::usdc::USDC → USDC; otherwise show last segment.
  if (!coinType) return "?";
  const parts = coinType.split("::");
  return parts[parts.length - 1] ?? coinType;
}
