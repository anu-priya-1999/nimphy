# 07 — API Architecture

Related: [05](05-component-responsibilities.md), [06](06-database-architecture-and-schema.md), [08](08-event-schema-and-payment-lifecycle.md) (owns payment/order/event state names), [11](11-security-and-privacy-architecture.md). Shapes are design-level and unimplemented.

**Revision note (0.3.0):** added EP-023 (the single capture operation), redefined EP-005/EP-021 as two-phase deletion, defined ERR-PAY-004/005 and ERR-LIFE-001/002 (referenced by docs 06 and 08 but previously undefined), aligned EP-016/017/020 with the doc 08 state vocabulary, and corrected the "no endpoint declares an order paid" statement so it covers EP-023.

## 1. Conventions

- Base path `/api/v1`. JSON only (`application/json`), except file exports and the webhook (raw body).
- Resource-oriented nouns; `kebab-case` paths; `camelCase` JSON fields.
- Money: `{ "amountMinor": 1999, "currency": "USD" }` — never floats.
- IDs: UUID strings. Timestamps: ISO-8601 UTC.
- Every response carries `x-correlation-id`.
- Validation: Zod (Proposed) schemas shared with the UI; reject unknown fields.
- Versioning: URI major version; additive changes are non-breaking; breaking ⇒ `/v2`.
- Resources whose status is `pending_deletion` (cases, accounts) behave as **404** on every endpoint (doc 06 §8).
- Order statuses in responses use exactly the doc 08 §1 vocabulary: `CREATED`, `APPROVAL_PENDING`, `APPROVED`, `CAPTURE_REQUESTED`, `COMPLETED`, `FAILED`, `EXPIRED`, `REFUNDED`, `REVERSED`.

## 2. Authentication and authorization

- Session cookie (HttpOnly, Secure, SameSite=Lax) established by the identity provider (ADR-011 OPEN). Mutating requests additionally require CSRF protection (origin check + token or SameSite strategy; doc 11).
- Authorization: resource ownership (`business_cases.user_id = session.user`; `orders.user_id = session.user`). A non-owned resource returns **404** (avoid existence leaks).
- Export and dossier-detail endpoints require an `active` Entitlement for the case (**402** semantics below).
- Webhook endpoint is unauthenticated by session but **authenticated by PayPal signature verification** (doc 08 §5.1).
- Operator actions (requeue/dismiss events, publish Rule Packs) are **not** part of the public API (FR-023).

## 3. Endpoint catalogue

| ID | Method & path | Auth | Purpose | Idempotency |
|---|---|---|---|---|
| EP-001 | `POST /cases` | user | Create case | `Idempotency-Key` |
| EP-002 | `GET /cases` | user | List own cases (paginated) | n/a |
| EP-003 | `GET /cases/{caseId}` | owner | Case + latest revision summary | n/a |
| EP-004 | `PATCH /cases/{caseId}` | owner | Title / archive / restore (never sets deletion status) | — |
| EP-005 | `DELETE /cases/{caseId}?acknowledgePaidLoss=true\|false` | owner | **Two-phase delete** (§6): phase 1 immediate, purge asynchronous | natural (repeat ⇒ 404) |
| EP-006 | `POST /cases/{caseId}/revisions` | owner | Save inputs → new revision | `Idempotency-Key` |
| EP-007 | `GET /cases/{caseId}/revisions/{n}` | owner | Read revision | n/a |
| EP-008 | `POST /cases/{caseId}/revisions/{n}/evidence` | owner | Attach evidence | `Idempotency-Key` |
| EP-009 | `POST /cases/{caseId}/revisions/{n}/runs` | owner | Run calculation | natural (same inputs ⇒ same hash) |
| EP-010 | `GET /runs/{runId}` | owner | Results (+ `?include=trace`) | n/a |
| EP-011 | `POST /runs/{runId}/memos` | owner | Generate memo | `Idempotency-Key` required |
| EP-012 | `GET /memos/{memoId}` | owner | Read memo | n/a |
| EP-013 | `GET /runs/{runId}/dossier/preview` | owner | Free preview (**OPEN** OQ-004) | n/a |
| EP-014 | `GET /rule-packs/{packId}` | user | Read pack used by a run | n/a |
| EP-015 | `GET /price-points/active` | user | Current price(s) | n/a |
| EP-016 | `POST /cases/{caseId}/orders` | owner | Create local order + PayPal order; returns approval URL | `Idempotency-Key` required |
| EP-017 | `GET /orders/{orderId}` | owner | Order status + entitlement summary (**polling**) | n/a |
| EP-018 | `GET /cases/{caseId}/entitlement` | owner | Entitlement status | n/a |
| EP-019 | `GET /runs/{runId}/dossier?format=markdown\|pdf` | owner + entitlement | Download export | n/a |
| EP-020 | `POST /webhooks/paypal` | PayPal signature | Receive notifications (doc 08 §5) | by `paypal_event_id` + `processing_status` |
| EP-021 | `DELETE /me?acknowledgePaidLoss=true\|false` | user | **Two-phase account deletion** (§6) | natural |
| EP-022 | `GET /me/export` | user | Data export (P1) | — |
| EP-023 | `POST /orders/{orderId}/capture` | owner | **The only operation that initiates a PayPal capture** (doc 08 §3) | `Idempotency-Key` optional; natural via compare-and-set |

There is deliberately **no** endpoint that lets a client *declare* an order paid. EP-023 asks the **server** to capture; it accepts no amount, no PayPal token or payer id, and no success flag, and it uses only the PayPal order id stored locally. EP-017 only *reports* state derived from server-side evidence (doc 08 §4).

## 4. Request/response examples

**EP-006 Save revision**

```http
POST /api/v1/cases/7c1e…/revisions
Idempotency-Key: 2f6c…
Content-Type: application/json

{
  "inputsSchemaVersion": 1,
  "inputs": {
    "marketplace": "EXAMPLE_MARKETPLACE",
    "format": "paperback",
    "listPrice": { "value": { "amountMinor": 1499, "currency": "USD" }, "provenance": "user_input" },
    "unitProductionCost": { "value": { "amountMinor": 450, "currency": "USD" }, "provenance": "estimate", "evidenceRefs": ["ev_1"] },
    "fixedCosts": [
      { "label": "Editing", "value": { "amountMinor": 90000, "currency": "USD" }, "provenance": "user_input" }
    ],
    "scenarios": {
      "low":  { "units": 100,  "priceDeltaPct": 0 },
      "base": { "units": 400,  "priceDeltaPct": 0 },
      "high": { "units": 1200, "priceDeltaPct": 0 }
    }
  }
}
```
(All numbers synthetic. `EXAMPLE_MARKETPLACE` is a placeholder; real marketplaces are OPEN, OQ-005.)

Response `201`:
```json
{ "revisionId": "…", "revisionNo": 3, "inputsHash": "sha256:…", "warnings": [
  { "code": "WARN-MISSING-EVIDENCE", "fieldPath": "listPrice", "message": "No evidence attached." } ] }
```

**EP-009 Run calculation** → `200` (same inputs return the same run):
```json
{
  "runId": "…",
  "ruleRef": { "packKey": "…", "version": "1.0.0", "contentHash": "sha256:…" },
  "engineVersion": "0.1.0",
  "scenarios": {
    "base": { "units": 400, "revenue": {"amountMinor": 0, "currency":"USD"}, "royalty": {"amountMinor": 0, "currency":"USD"}, "netContribution": {"amountMinor": 0, "currency":"USD"} }
  },
  "breakEven": { "reachable": true, "units": 0 },
  "sensitivity": [ { "driver": "listPrice", "perturbationPct": 10, "deltaNetContribution": {"amountMinor": 0, "currency":"USD"} } ],
  "disclaimer": "Illustrative scenarios, not guaranteed outcomes.",
  "missingEvidence": ["listPrice"]
}
```
(Zero values are placeholders in this document, not outputs.)

**EP-016 Create order** → `201`:
```json
{ "orderId": "…", "paypalOrderId": "…", "approvalUrl": "https://…", "status": "APPROVAL_PENDING", "expiresAt": "…" }
```
Amount and currency come from the active `price_point` server-side; the request body contains **no price**. If an open order for the case already exists in `APPROVAL_PENDING` the same order is returned (`200`, idempotent); if it is `CAPTURE_REQUESTED` the response is `409 ERR-PAY-003`.

**EP-017 Poll** → `{ "orderId": "…", "status": "CAPTURE_REQUESTED", "entitlement": null, "retryAfterMs": 2000 }` until the order is `COMPLETED`, then `{ "status": "COMPLETED", "entitlement": { "status": "active" } }`. Terminal statuses (`FAILED`, `EXPIRED`, `REFUNDED`, `REVERSED`) carry no `retryAfterMs`.

**EP-023 Capture**

```http
POST /api/v1/orders/9b2d…/capture
Cookie: session=…
```
(no body). The server (1) loads the local order owned by the caller, (2) reads the order from PayPal with its own credentials and validates approval, amount, currency and payee, (3) moves the order to `CAPTURE_REQUESTED` by compare-and-set under the order row lock, (4) performs the single PayPal capture call, (5) settles through `settleCapture` (doc 08 §3–4). Responses:

| Status | Body | Meaning |
|---|---|---|
| `200` | `{ "status": "COMPLETED", "entitlement": { "status": "active" } }` | Captured, validated, entitlement granted in the same transaction |
| `202` | `{ "status": "CAPTURE_REQUESTED", "retryAfterMs": 2000 }` | Outcome not yet known (timeout, `PENDING` capture, concurrent request); poll EP-017; never retried with a different key |
| `409` | `ERR-PAY-005` | PayPal reports the buyer has not completed approval |
| `409` | `ERR-PAY-003` | Order not in a capturable state (`EXPIRED`, `FAILED`, `COMPLETED`, …) |
| `409` | `ERR-PAY-004` | Server-side validation failed (amount, currency or payee mismatch); not captured, order flagged |
| `502` | `ERR-PAY-002` | PayPal unavailable before any capture was attempted |

**EP-005 / EP-021 Delete** → `202`: `{ "status": "deletion_requested" }`. After the `202` the case (or account) is already invisible (404 everywhere); purge completes asynchronously and is retried until done. `409 ERR-LIFE-001` if a payment is in flight (`CAPTURE_REQUESTED`); `409 ERR-LIFE-002` if paid access would be lost and `acknowledgePaidLoss=true` was not supplied.

## 5. Error contract

RFC 7807-style:
```json
{ "type": "https://nimphy.example/errors/ERR-VAL-001", "code": "ERR-VAL-001",
  "title": "Validation failed", "status": 422, "correlationId": "…",
  "errors": [ { "path": "inputs.listPrice.value.amountMinor", "code": "ERR-VAL-002", "message": "Must be > 0" } ] }
```

| Code | HTTP | Meaning |
|---|---|---|
| ERR-AUTH-001 | 401 | Not authenticated |
| ERR-AUTH-002 | 403 | CSRF/origin check failed |
| ERR-RES-001 | 404 | Not found, not owned, or `pending_deletion` |
| ERR-VAL-001 | 422 | Request validation failed |
| ERR-VAL-002 | 422 | Field-level violation |
| ERR-IDEM-001 | 409 | Idempotency key reused with different request |
| ERR-IDEM-002 | 400 | Idempotency key missing where required |
| ERR-CALC-001 | 422 | No applicable Rule Pack |
| ERR-CALC-002 | 422 | Inputs out of supported range |
| ERR-AI-001 | 503 | AI unavailable (numbers still available) |
| ERR-AI-002 | 502 | AI output rejected by validator |
| ERR-AI-003 | 429 | AI budget/regeneration limit reached |
| ERR-PAY-001 | 402 | Entitlement required |
| ERR-PAY-002 | 502 | PayPal unavailable |
| ERR-PAY-003 | 409 | Order in non-actionable state (also: open order already capturing) |
| ERR-PAY-004 | 409 | Order failed server-side validation (amount/currency/payee mismatch); not captured |
| ERR-PAY-005 | 409 | Buyer approval not completed at PayPal |
| ERR-LIFE-001 | 409 | Deletion refused: a payment is in flight (`CAPTURE_REQUESTED`); retry after it settles or expires |
| ERR-LIFE-002 | 409 | Deletion would revoke paid access; resend with `acknowledgePaidLoss=true` |
| ERR-HOOK-001 | 400 | Webhook signature verification failed |
| ERR-HOOK-002 | 400 | Webhook malformed |
| ERR-RATE-001 | 429 | Rate limit exceeded (`Retry-After`) |
| ERR-SYS-001 | 500 | Unexpected error (no internals leaked) |

**Webhook response policy (EP-020; authoritative table in doc 08 §5.3):**

| Situation | HTTP | Stored? |
|---|---|---|
| Signature invalid | `400` (ERR-HOOK-001) | No (audit row without body) |
| Malformed after verification | `400` (ERR-HOOK-002) | No |
| Verification service or database unavailable | `503` | No — PayPal retries (non-2xx = failed delivery; up to 25 attempts over 3 days, doc 08 §0) |
| New event stored; processing succeeded or ended `IGNORED`/`REJECTED` | `200` | Yes |
| New event stored; processing failed (`FAILED_RETRYABLE`) | `500` | Yes — our sweeper also retries |
| Duplicate whose stored status is final (`PROCESSED`, `IGNORED`, `REJECTED`, `FAILED_TERMINAL`) | `200` | Already stored |
| Duplicate whose stored status is non-final and lease expired | claim and process; `200` / `500` as above | Already stored |
| Duplicate whose lease is still active | `200 {"status":"deferred"}` | Already stored; the sweeper guarantees pickup |

A duplicate event id is **never** treated as proof of successful processing; the stored `processing_status` decides.

## 6. Deletion semantics (summary; owner: doc 06 §8)

- EP-005: phase 1 (one transaction) hides the case, revokes its active entitlements, expires unpaid open orders; refused with `ERR-LIFE-001` while an order is `CAPTURE_REQUESTED`; requires `acknowledgePaidLoss=true` when an active entitlement exists (`ERR-LIFE-002`). Phase 2 purges content and stored files; orders and payment records remain in minimised form.
- EP-021: the same for every case of the account, then redaction and tombstoning of the user row (the row is removed only when the user has no orders). Requires recent authentication (OPEN).
- Neither endpoint refunds anything; refund policy is OPEN (OQ-007).

## 7. Idempotency

`Idempotency-Key` (client UUID) stored in `idempotency_keys` with a request hash; replay with the same key and body returns the stored response; same key with different body ⇒ ERR-IDEM-001. Required on EP-011 and EP-016 (cost and money); optional on EP-023, which is idempotent by construction (compare-and-set under the order lock plus a deterministic PayPal request id, doc 08 §3.2 Q7). Webhooks are idempotent by `paypal_event_id` combined with `processing_status` (doc 08 §5.3).

## 8. Pagination

Cursor-based for lists: `?limit=20&cursor=…`, max `limit=100`, stable ordering by `(updated_at desc, id)`. Response: `{ "items": [...], "nextCursor": "…" | null }`.

## 9. Rate limiting (starting values — *Assumption — not yet validated*)

| Scope | Limit |
|---|---|
| Unauthenticated | low per-IP |
| Authenticated reads | moderate per user |
| EP-009 | e.g. 30/min per user |
| EP-011 (AI) | e.g. 5/hour per case, daily per user cap |
| EP-016 | e.g. 10/hour per user |
| EP-023 | e.g. 10/min per user (the server also coalesces concurrent calls through the order lock) |
| EP-005 / EP-021 | low per user |
| EP-020 | not user-rate-limited; protected by signature verification and body-size cap |

Mechanism (in-DB counter vs edge vs managed) is **OPEN** (doc 15).

## 10. Security notes

Body-size limits; strict content types; no reflection of user input into error messages unescaped; webhook uses raw body for signature; CORS closed by default (same-origin); responses for other users' resources are 404; no stack traces; secrets never logged; the redirect parameters PayPal appends to the return URL are ignored by EP-023 (the server uses only its stored `paypal_order_id`). Full controls in doc 11.
