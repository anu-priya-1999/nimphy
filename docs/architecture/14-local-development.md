# 14 — Local Development Architecture

**Verification status:** Repository scaffolding, core toolchain versions, and base developer commands were verified during STEP-001 (doc 17). Commands and configurations marked `[UNVERIFIED]` represent planned design intent for future roadmap steps (database setup, migrations, seed, integration tests, E2E tests, and docs check) and must be confirmed during their respective steps before being treated as authoritative.

Related: [13](13-deployment-and-infrastructure.md), [12](12-testing-and-ai-evaluation.md), [17](17-implementation-roadmap.md).

## 1. Prerequisites

| Tool | Notes |
|---|---|
| Git | version control |
| Node.js `24.18.0` (Active LTS; pinned in `.nvmrc` and root `package.json` `engines`) | runtime (verified in STEP-001) |
| pnpm `10.34.5` (via Corepack; pinned in root `packageManager`) | package manager (verified in STEP-001) |
| PostgreSQL 16-class (local install or container) | verified in STEP-010 (PostgreSQL 16 in CI, PostgreSQL 16/18 supported locally) |
| Docker (optional) | simplest local Postgres container |
| PayPal developer sandbox account | for checkout testing (planned for STEP-024 `[UNVERIFIED]`) |
| AI provider key (optional) | otherwise fake provider (planned for STEP-019 `[UNVERIFIED]`) |

## 2. Repository setup (verified in STEP-001)

```bash
git clone <repo-url> nimphy
cd nimphy
corepack enable
pnpm install                  # or pnpm install --frozen-lockfile
cp .env.example .env.local    # on Windows PowerShell: Copy-Item .env.example .env.local; then fill values
```

## 3. Environment variables (names are proposals)

| Variable | Purpose | Secret? |
|---|---|---|
| `DATABASE_URL` | Postgres connection | yes |
| `SESSION_SECRET` | session signing | yes |
| `AUTH_*` | identity provider settings (ADR-011 OPEN) | yes |
| `PAYPAL_ENV` | `sandbox` \| `live` | no |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | server-only | yes |
| `PAYPAL_WEBHOOK_ID` | webhook verification | yes |
| `LLM_PROVIDER` / `LLM_API_KEY` / `LLM_MODEL` | AI adapter; `fake` allowed | yes (key) |
| `AI_DAILY_BUDGET_*` | cost caps | no |
| `APP_BASE_URL` | return URLs, CSRF origin | no |
| `FEATURE_CHECKOUT_ENABLED`, `FEATURE_AI_MEMO_ENABLED` | kill switches (checkout flag blocks only new orders, never capture or webhooks) | no |
| `PAYPAL_ORDER_TTL_MINUTES`, `PAYPAL_CAPTURE_LEASE_SECONDS`, `PAYPAL_EXPIRY_GRACE_MINUTES` | order TTL, capture lease, expiry grace (doc 08 §6) | no |
| `WEBHOOK_MAX_ATTEMPTS`, `WEBHOOK_BACKOFF_SCHEDULE`, `WEBHOOK_SWEEP_BATCH` | sweeper retry budget and backoff (doc 08 §5.7) | no |
| `DELETION_PURGE_BATCH`, `DELETION_LEDGER_SINK` | purge sweeper and deletion-ledger destination (OPEN) | no |

`.env.example` contains names and dummy values only; real values never committed. A startup check validates env with a schema and fails fast.

## 4. Local commands

| Purpose | Command | Status |
|---|---|---|
| Dev server | `pnpm dev` | Verified in STEP-001 (Next.js 16.4.5 at `http://localhost:3000`) |
| Build | `pnpm build` | Verified in STEP-001 (Turbopack production build) |
| Typecheck | `pnpm typecheck` | Verified in STEP-001 (TypeScript 5.8.3 across 8 workspace projects) |
| Lint | `pnpm lint` | Verified in STEP-001 (ESLint 10.14.0 flat config) |
| Format check | `pnpm format:check` | Verified in STEP-001 (Prettier 3.5.3) |
| Format write | `pnpm format` | Verified in STEP-001 (Prettier 3.5.3) |
| Unit tests | `pnpm test` | Verified in STEP-001 (Vitest 3.0.8, 2/2 tests passed) |
| Test watch | `pnpm test:watch` | Verified in STEP-001 (Vitest interactive watcher) |
| Docs check | `pnpm docs:check` | Verified in STEP-002 |
| DB migrate | `pnpm db:migrate` | Verified in STEP-010 (applies forward-only migrations via Node pg runner) |
| DB tests | `pnpm test:db` | Verified in STEP-010 (PostgreSQL integration tests against DATABASE_URL or local instance) |
| Integration tests | `pnpm test:integration` | Planned / `[UNVERIFIED]` (scheduled for STEP-012+) |
| E2E | `pnpm test:e2e` | Planned / `[UNVERIFIED]` (scheduled for STEP-028) |

## 5. Database setup (verified in STEP-010)

### Option A: Docker container (recommended for containerized workflows)
```bash
docker run --name nimphy-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 -d postgres:16
# Run cluster and database bootstrap once as admin (creates nimphy_migrator, nimphy_app, nimphy_purge roles and sets schema ownership via identifier-safe dynamic SQL):
# psql -h localhost -U postgres -d postgres -f packages/persistence/scripts/bootstrap.sql
# Then provision dedicated non-superuser service logins (nimphy_migrator_login, nimphy_app_login, nimphy_purge_login) with controlled membership:
# GRANT nimphy_migrator TO nimphy_migrator_login WITH INHERIT FALSE, SET TRUE;
# Set DATABASE_URL in .env.local connecting as the migration login:
# DATABASE_URL="postgresql://nimphy_migrator_login:pass@localhost:5432/nimphy_dev"
pnpm db:migrate
pnpm test:db
```

### Option B: Local PostgreSQL instance (native install or service)
```bash
# Ensure PostgreSQL 16 or 18 is running locally.
# When DATABASE_URL is omitted during local development/tests, `pnpm test:db`
# automatically spins up an ephemeral test database cluster on port 5433 using local pg_ctl/initdb
# and automatically bootstraps roles and schema ownership.
pnpm test:db
```

Database setup, migration runner, and integration test suite were verified in STEP-010 (ADR-015). Database seeding (`pnpm db:seed:dev`) is deferred; synthetic Rule Packs (`TEST_*`) are loaded from `fixtures/rules/` in tests without requiring production seeds. Real Rule Packs are published by an explicit operator command after sourcing (OQ-006).

## 6. Webhook testing locally

Options (**OPEN**): (a) replay recorded sandbox payloads against the local endpoint using a script; (b) expose the local port with a tunnelling tool and register that URL as a sandbox webhook. Option (a) is the default for CI-friendly tests; (b) for manual end-to-end sandbox checks. Real signature verification requires the sandbox webhook id, and PayPal's postback verification does not support simulator mock events, so local tests use recorded real sandbox events (or self-verification). A script that replays one stored event many times in parallel is the standard duplicate/concurrency check (doc 08 §10).

## 7. Windows development considerations

- Prefer **WSL2** (Ubuntu) for the toolchain; keep the repo inside the WSL filesystem (not `/mnt/c`) for speed and file-watching reliability.
- If using native Windows: use PowerShell or Git Bash consistently; avoid shell scripts with bash-only syntax in `package.json` (use cross-platform Node scripts); `cp .env.example .env.local` becomes `Copy-Item .env.example .env.local`.
- Line endings: set `.gitattributes` (`* text=auto eol=lf`) to keep LF and avoid hash/lockfile churn; golden fixture and hash tests are sensitive to line endings.
- Long path and file-watcher limits can break dev servers; WSL2 avoids most.
- Docker Desktop with WSL2 backend for Postgres.
- Path handling: use `path` utilities in scripts; never hard-code `/`.
- PDF rendering may behave differently across OS (fonts); PDF tests assert text content, not pixel equality.

## 8. Troubleshooting (anticipated)

| Symptom | Likely cause | Action |
|---|---|---|
| Cannot connect to DB | container down / wrong URL | check container, `DATABASE_URL` |
| Webhook verification fails locally | wrong `PAYPAL_WEBHOOK_ID` or modified body | use raw body; use sandbox webhook id |
| Golden tests differ on Windows | CRLF line endings | enforce LF |
| Memo always fails validation | fake provider not seeded / prompt version mismatch | check `LLM_PROVIDER=fake` fixture set |
| Type errors after pull | lockfile change | `pnpm install` |
| Port in use | stale dev server | free the port |

## 9. Definition of a working local setup (for STEP-001 acceptance)

Fresh clone → install (`pnpm install --frozen-lockfile`) → env (`.env.example` verified) → typecheck (`pnpm typecheck` green) → lint (`pnpm lint` green) → format (`pnpm format:check` green) → test (`pnpm test` green) → build (`pnpm build` green) → `pnpm dev` serves the app. (Database setup and migrations are planned for STEP-010). Anyone failing this has found a documentation defect to fix here.
