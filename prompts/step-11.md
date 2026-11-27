# STEP-011 — Clerk Identity and Sessions

## Authorization

The owner formally accepted STEP-010 on **2026-11-26** and authorized STEP-011 implementation.

## Owner-Approved Decisions

1. **Authentication Provider (ADR-011 Accepted):**
   - Use **Clerk** (`@clerk/nextjs`) provisioned as a separate Clerk application isolated from Fluxora (separate credentials, sessions, cookies, callbacks, and environment configuration).
2. **Anonymous Access (OQ-010 Closed):**
   - Visitors may use non-persistent calculations without signing in.
   - Sign-in is required before creating or saving a persistent business case or accessing persistent user-specific data.
   - Anonymous calculations must not silently create database records or persist sensitive user input.
3. **Cost and Session Policy:**
   - Start with Clerk's Hobby tier without paid-plan dependencies.
   - Accept Clerk's default fixed seven-day session lifetime initially; document session-lifetime limitations and security trade-offs without building custom session infrastructure.

## Scope Implemented

1. Clerk identity-provider integration (`@clerk/nextjs`, `apps/web/proxy.ts` for Next.js 16, `ClerkProvider` in `apps/web/app/layout.tsx`, App Router `/sign-in` and `/sign-up` routes).
2. Nimphy server-side `currentUser()`, `requireCurrentUser()`, and `resolveCurrentUser()` abstraction (`apps/web/lib/auth/`) returning branded `UserId`.
3. Local-user identity mapping (`packages/persistence/src/users/user-repository.ts`) with atomic `ON CONFLICT (idp_subject) WHERE idp_subject IS NOT NULL DO NOTHING`, zero email-based merging, and strict `status = 'active'` enforcement.
4. Reusable server-side authentication and ownership guards (`requirePageUser`, `requireApiUser`, `assertResourceOwner`) and RFC 7807 error mapping (`ERR-AUTH-001`, `ERR-AUTH-002`, `ERR-RES-001`, `ERR-SYS-001`).
5. Signed double-submit CSRF protection (`apps/web/lib/security/csrf.ts` and `GET /api/auth/csrf`) with `Origin` validation, `crypto.timingSafeEqual`, `__Host-nimphy_csrf` production cookies, and fail-closed missing-secret handling.
6. Deterministic unit and PostgreSQL integration tests covering identity resolution, concurrency, tombstone/inactive denial, cross-user authorization denial, and CSRF validation.
