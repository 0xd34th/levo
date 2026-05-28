## Goal

Restore `apps/web` quality gates and high-value production guardrails so the web app can be linted, tested, built, health-checked, and smoke-tested without relying on dead swap adapters or stale CI paths.

## Scope

- `apps/web` lint, unit tests, package scripts, dependency audit surface, health route, and minimal browser smoke.
- Agent chat swap handoff from chat tool output to the existing local swap panel.
- Root CI and rsync deploy healthcheck configuration.
- Root `SPEC.md` / `PLAN.md` plus env/docs updates required by this web readiness work.

## Non-Goals

- Do not remediate `apps/aisui` or `apps/flux` dependency advisories.
- Do not add a new swap SDK, bridge embed, or production bridge execution path.
- Do not deploy production or change production secrets.
- Do not refactor Earn state-machine internals.

## Public Interfaces

- `GET /api/health` returns a secret-free JSON payload:
  - `status: "ok" | "degraded"`
  - `checks.db`
  - `checks.redis`
  - `checks.env`
  - `checks.gasStation`
  - `checks.agentScheduler`
- Agent `write-card` payloads may include `href`.
- Agent `prepare_swap` returns `status: "open_local_surface"` and `href: "/agent/new?surface=swap"`.
- `/agent/new?surface=swap|send|bridge` opens the matching local trade surface.
- `apps/web` exposes `pnpm test:e2e`.

## Acceptance

1. `pnpm --dir apps/web lint` passes.
2. `pnpm --dir apps/web typecheck` passes.
3. `pnpm --dir apps/web test` passes.
4. `pnpm --dir apps/web build` passes.
5. `pnpm --dir apps/web test:e2e` passes.
6. Web-scoped audit has no `apps__web` moderate/high/critical advisories; non-web app advisories remain out of scope.
7. `prepare_swap` no longer attempts OKX or unimplemented 7K quote adapters; it opens the local swap surface.
8. `GET /api/health` returns structured health checks without exposing secret values and is used by `scripts/deploy-rsync.sh`.
9. CI runs against `main`, removes the nonexistent signer test, and explicitly typechecks web.
10. `scripts/deploy-rsync.sh --dry-run --skip-env` remains usable.
