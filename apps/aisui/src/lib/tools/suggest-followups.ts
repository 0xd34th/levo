import { tool } from "ai";
import { z } from "zod";

export const suggestFollowupsParams = z.object({
  questions: z
    .array(z.string().min(2).max(120))
    .min(1)
    .max(6)
    .describe("3-4 short follow-up questions the user might tap as chips."),
});

export type SuggestFollowupsInput = z.infer<typeof suggestFollowupsParams>;

export const suggestFollowupsTool = tool({
  description:
    "Emit 3-4 chip-style follow-up questions tailored to the just-rendered context. Always call last.",
  inputSchema: suggestFollowupsParams,
  execute: async (input) => ({ questions: input.questions }),
});
