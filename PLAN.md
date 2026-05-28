1. Update `SPEC.md / PLAN.md` for the web readiness scope and acceptance above.
2. Fix web lint issues:
   - Replace the empty `ToolContext` interface with an alias to `ExplorerToolContext`.
   - Remove unused explorer helper code.
   - Rename the local `module` variable in `describeCommand()` while preserving the returned `module` field.
3. Fix CI:
   - Trigger push/PR on `main`.
   - Remove `pnpm --filter nautilus-signer test`.
   - Add `pnpm --filter web typecheck`.
   - Use one explicit CI env block for lint/typecheck/test/build.
4. Fix web audit surface:
   - Upgrade `apps/web` Vitest to a release that resolves `picomatch >= 4.0.4`.
   - Keep `apps/aisui` and `apps/flux` advisories documented as out of scope.
5. Unify Agent swap:
   - Make `prepare_swap` return a local surface handoff instead of quote-provider attempts.
   - Render `write-card.href` as an “Open swap panel” link.
   - Parse `surface=swap|send|bridge` in `AgentComposerWorkbench` and pass it to `AgentChatPanel`.
6. Add production health/deploy guardrails:
   - Add `apps/web/app/api/health/route.ts` and route tests.
   - Change deploy default healthcheck to `/api/health`.
   - Document `APP_ORIGIN` in env/docs where missing.
7. Add minimal e2e smoke:
   - Add `apps/web/playwright.config.ts` and `apps/web/e2e/smoke.spec.ts`.
   - Cover unauthenticated render of `/`, `/send`, `/earn`, `/agent/new`, `/lookup`, and `/tools`.
8. Run acceptance commands and fix failures:
   - `pnpm --dir apps/web lint`
   - `pnpm --dir apps/web typecheck`
   - `pnpm --dir apps/web test`
   - `pnpm --dir apps/web build`
   - `pnpm --dir apps/web test:e2e`
   - web-scoped audit filter
   - `scripts/deploy-rsync.sh --dry-run --skip-env`
