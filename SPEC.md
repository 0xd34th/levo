## Goal

Add a first-run, restartable onboarding tour on `/agent/new` that teaches a user how to start from the agent command presets, shape an Earn mandate safely, review approval limits, and bind a BYO external runner.

## Scope

- `/agent/new` client UI only.
- Browser-local onboarding state using `localStorage`.
- Stable tour anchors on existing agent, mandate, preview, and settings surfaces.
- Focused unit coverage for first-run display, dismiss/complete persistence, restart, and required guide copy.
- Root `SPEC.md` / `PLAN.md` updates for this onboarding work.

## Non-Goals

- No backend API, Prisma migration, account-level onboarding sync, analytics event, production deploy change, or secrets change.
- No new UI dependency or broad redesign of the agent workspace.
- No change to mandate creation, signing, runner binding, or scheduler semantics.

## Public Interfaces

- New component:
  - `AgentOnboardingTour({ onOpenSettings }: { onOpenSettings: () => void })`
- Browser state key:
  - `levo.agentOnboarding.v1`
- Stable DOM anchors:
  - `data-agent-tour="chat-start"`
  - `data-agent-tour="mandate-intent"`
  - `data-agent-tour="mandate-options"`
  - `data-agent-tour="mandate-preview"`
  - `data-agent-tour="agent-settings-toggle"`
  - `data-agent-tour="runner-bind"`
  - `data-agent-tour="runner-token"`

## Acceptance

1. `/agent/new` renders a persistent `Guide` restart control.
2. The tour auto-starts only when `localStorage` has no dismissed or completed state for `levo.agentOnboarding.v1`.
3. `Close` writes a dismissed state; `Done` writes a completed state.
4. Clicking `Guide` reopens the tour after dismissed or completed state.
5. Tour copy covers:
   - starting from chat, wallet, on-chain, trade, or mandate commands;
   - shaping an Earn mandate from an intent;
   - reviewing caps, cadence, expiry, and preview before signing;
   - opening settings and binding an external runner;
   - copying and storing the one-time runner setup prompt after binding.
6. The tour can open the Agent settings panel for runner binding without blocking normal workspace actions.
7. Existing agent chat and mandate creation behavior remains unchanged.
8. Verification commands pass:
   - `pnpm --dir apps/web test -- AgentComposerWorkbench`
   - `pnpm --dir apps/web test -- AgentChatPanel`
   - `pnpm --dir apps/web lint`
   - `pnpm --dir apps/web typecheck`
   - `pnpm --dir apps/web test`
   - `pnpm --dir apps/web build`
   - `pnpm --dir apps/web test:e2e`
