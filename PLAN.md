1. Update `SPEC.md / PLAN.md` for the `/agent/new` onboarding tour scope and acceptance.
2. Add failing unit coverage in `AgentComposerWorkbench.test.tsx`:
   - `/agent/new` renders `Guide`.
   - first-run guide copy covers chat start, mandate creation, approval review, runner binding, and runner setup prompt storage.
   - `Close` persists dismissed state.
   - `Done` persists completed state.
   - `Guide` reopens after dismissed or completed state.
3. Add `apps/web/components/agent/AgentOnboardingTour.tsx`:
   - use `levo.agentOnboarding.v1`;
   - read/write only browser `localStorage`;
   - auto-start once when no state exists;
   - support `Next`, `Back`, `Done`, `Close`, and restart via `Guide`;
   - use a fixed coachmark/highlight and existing `Button`.
4. Wire the workbench:
   - render the onboarding tour in `/agent/new`;
   - add an always-visible `Agent settings` control;
   - pass settings open callback into the tour.
5. Add stable DOM anchors:
   - chat command empty state;
   - mandate intent/no-intent state;
   - mandate options and approval review area;
   - mandate preview;
   - Agent settings toggle;
   - external runner bind form;
   - runner token/setup prompt panel.
6. Run targeted tests and fix failures:
   - `pnpm --dir apps/web test -- AgentComposerWorkbench`
   - `pnpm --dir apps/web test -- AgentChatPanel`
7. Run full acceptance and fix failures:
   - `pnpm --dir apps/web lint`
   - `pnpm --dir apps/web typecheck`
   - `pnpm --dir apps/web test`
   - `pnpm --dir apps/web build`
   - `pnpm --dir apps/web test:e2e`
