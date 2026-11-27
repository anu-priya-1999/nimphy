# STEP-011 Implementation Record — Clerk Identity and Sessions

## 1. Summary

STEP-011 establishes Nimphy's authentication, session, local user mapping, route guard, and CSRF protection infrastructure using Clerk (`@clerk/nextjs@7.10.10`) and PostgreSQL (`app_users`).

## 2. Key Components

### A. Persistence User Repository (`packages/persistence/src/users/`)

- `findUserByIdpSubject(client, idpSubject)` — queries `app_users` strictly by `idp_subject`, returning a branded `UserId` (`parseUserId`).
- `findOrCreateUserByIdpSubject(client, { idpSubject, email })` — atomically provisions a local `active` user using `INSERT ... ON CONFLICT (idp_subject) WHERE idp_subject IS NOT NULL DO NOTHING` with fallback `SELECT`, preventing duplicate rows under concurrent first-time sign-ins and never reactivating `pending_deletion` or tombstoned (`deleted`) accounts.

### B. Nimphy Identity Abstraction (`apps/web/lib/auth/`)

- `resolveCurrentUser(deps)` — uses Clerk `auth()` per request (`AuthProviderPort`) and queries Clerk Backend API for verified primary email only during first-time local provisioning. Explicitly distinguishes `authenticated`, `unauthenticated`, and `inactive_account` (`pending_deletion` / `deleted`), while failing closed (`IdentityInfrastructureError`) on provider or database errors.
- `currentUser()` / `requireCurrentUser()` — thin server-side entrypoints using `createClerkAuthProvider()` and `createPgUserRepository(getServerDatabasePool())`.

### C. Route Guards & Authorization (`apps/web/lib/auth/guards.ts`)

- `requirePageUser(options)` — redirects unauthenticated or inactive users to `/sign-in` (preserving `redirect_url`), while propagating infrastructure errors.
- `requireApiUser(request, options)` — enforces CSRF on mutating HTTP methods and active authentication, returning RFC 7807 JSON (`ERR-AUTH-001` 401, `ERR-AUTH-002` 403, `ERR-SYS-001` 503) with `x-correlation-id`.
- `assertResourceOwner(actorUserId, ownerUserId)` — throws `ForbiddenResourceError` (`ERR-RES-001` 404) on cross-user access attempts to prevent existence leaks.

### D. CSRF Protection (`apps/web/lib/security/csrf.ts`, `apps/web/app/api/auth/csrf/route.ts`)

- Signed double-submit cookie (`__Host-nimphy_csrf` in production, `nimphy_csrf` in dev) using `crypto.randomBytes(32)` + HMAC-SHA256 (`CSRF_SECRET` ≥ 32 chars) and `crypto.timingSafeEqual`.
- Validates `Origin` against `APP_BASE_URL` (requiring `https:` in production) and fails closed if configuration is missing.

### E. Next.js 16 Clerk Integration (`apps/web/`)

- `apps/web/proxy.ts` — Next.js 16 `clerkMiddleware()` keeping `/` and anonymous calculation routes public.
- `apps/web/app/layout.tsx` — wraps the app in `<ClerkProvider>` when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is configured.
- `apps/web/app/sign-in/[[...sign-in]]/page.tsx` and `apps/web/app/sign-up/[[...sign-up]]/page.tsx` — dynamic App Router auth pages.
