# STEP-011 Technical Interview Preparation — Identity and Sessions

## 1. Why does Nimphy map Clerk subjects to a local `app_users` UUID instead of using Clerk IDs directly as foreign keys?

- **P-10 Reversibility & Domain Purity:** `UserId` is a branded PostgreSQL UUID (`gen_random_uuid()`), decoupling business tables (`business_cases`, `orders`, `entitlements`) from any specific IdP string format.
- **Tombstone & Financial Integrity:** When a user deletes their account with existing `orders`, `app_users` nulls `idp_subject` and `email` (`status = 'deleted'`) while preserving the UUID row so `orders.user_id` (`ON DELETE RESTRICT`) remains valid without retaining PII.

## 2. Why must Nimphy never match or merge local accounts by email?

- Email addresses can be recycled, unverified on some OAuth providers, or changed by users. Matching by email alone risks account takeover and violates tombstone isolation: a new Clerk account using a previously deleted user's email must receive a fresh `app_users` row rather than resurrecting or inheriting prior records.

## 3. How does `findOrCreateUserByIdpSubject` prevent race conditions on first sign-in?

- Two concurrent requests from the same newly signed-in Clerk user execute `INSERT INTO app_users (idp_subject, email, status) VALUES ($1, $2, 'active') ON CONFLICT (idp_subject) WHERE idp_subject IS NOT NULL DO NOTHING RETURNING ...`.
- One request inserts and gets the row via `RETURNING`; the other hits the partial unique index conflict, receives 0 rows, and immediately executes `SELECT ... WHERE idp_subject = $1`, returning the exact same `UserId` without overwriting `status`.

## 4. Why isn't `clerkMiddleware()` in `proxy.ts` sufficient as the sole authorization boundary?

- Middleware is a coarse perimeter. Every Server Component, Route Handler, and Server Action must independently enforce `requirePageUser()` / `requireApiUser()` and resource ownership (`assertResourceOwner` / `user_id` scoping) to prevent defense-in-depth bypasses and IDOR vulnerabilities (TH-05).

## 5. Why does Nimphy implement application-level CSRF protection alongside Clerk?

- Clerk's OAuth `state`/`nonce`/`PKCE` protects the login flow, not Nimphy's own state-changing API mutations. Because browser requests carry `SameSite=Lax` cookies, mutating endpoints (`POST`/`PATCH`/`DELETE`) additionally require strict `Origin` validation against `APP_BASE_URL` and a signed double-submit CSRF token (`x-csrf-token` matched against an `HttpOnly` HMAC-signed cookie via `crypto.timingSafeEqual`).
