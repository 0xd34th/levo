import { createDeepSeek } from "@ai-sdk/deepseek";
import type { LanguageModel } from "ai";
import { env } from "@/lib/env";

export type ModelMode = "fast";

export interface RouterPick {
  mode: ModelMode;
  model: LanguageModel;
  modelId: string;
  /** Whether the chosen tier supports / emits reasoning tokens. */
  reasoning: boolean;
}

let provider: ReturnType<typeof createDeepSeek> | null = null;

function getProvider() {
  if (!provider) {
    provider = createDeepSeek({
      apiKey: env.deepseekKey() ?? "",
      baseURL: env.deepseekBaseUrl(),
    });
  }
  return provider;
}

function isReasoner(modelId: string): boolean {
  return /reason|thinking|r1|reasoner/i.test(modelId);
}

export function pickModel(mode: ModelMode): RouterPick {
  const ds = getProvider();
  const modelId = env.defaultProvider();
  return {
    mode,
    model: ds.chat(modelId),
    modelId,
    reasoning: isReasoner(modelId),
  };
}

export function isModelMode(value: unknown): value is ModelMode {
  return value === "fast";
}
