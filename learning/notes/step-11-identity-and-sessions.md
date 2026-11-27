# STEP-011 Engineering Reference Notes — Identity and Sessions

## Environment Variables

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk publishable key for Nimphy's dedicated Clerk application.
- `CLERK_SECRET_KEY` — Server-only Clerk secret key (never exposed to client bundles, logs, or tests).
- `CSRF_SECRET` — Server-only HMAC-SHA256 secret (minimum 32 characters) for signed double-submit CSRF tokens.
- `APP_BASE_URL` — Canonical application origin used for CSRF `Origin` validation (`https://` required when `NODE_ENV === 'production'`).

## Session Policy & Limitations (Clerk Hobby Tier)

- Nimphy uses Clerk's default fixed **7-day session lifetime**.
- **Limitation:** Hobby-tier configuration does not provide custom idle-timeout overrides; a session remains valid for 7 days unless the user signs out or the session is revoked.
- **Mitigation:** Server-side `resolveCurrentUser()` checks `app_users.status === 'active'` on every protected request, so `pending_deletion` or `deleted` accounts are denied immediately. Sensitive operations (account deletion in STEP-030) will require recent-authentication / step-up verification.

## Next.js 16 Specifics

- Request middleware uses `apps/web/proxy.ts` (`clerkMiddleware()`), replacing the legacy `middleware.ts` filename.
- `auth()` and `clerkClient()` from `@clerk/nextjs/server` are async and awaited on the server.
- `<ClerkProvider>` is mounted in `apps/web/app/layout.tsx` when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is present so static builds in CI succeed without production secrets.
