# 10 — Frontend Architecture

Related: [07](07-api-architecture.md), [11](11-security-and-privacy-architecture.md). Framework names are **Proposed** (ADR-002): React with Next.js App Router, TypeScript, Tailwind CSS. Not established by any repository.

## 1. Application structure

Single web app inside the monolith (`apps/web`). Server components for data-light pages; client components for forms and interactive results. UI code never performs financial arithmetic: it formats values returned by the API (INV-01, P-01).

## 2. Route organisation

| Route | Page | Auth |
|---|---|---|
| `/` | Landing + value + disclaimer | public |
| `/pricing` | Price points (from API) | public |
| `/sign-in` | Provider hand-off | public |
| `/cases` | List cases | user |
| `/cases/new` | Create case | user |
| `/cases/[id]` | Overview: latest revision, runs, status | owner |
| `/cases/[id]/inputs` | Structured input form | owner |
| `/cases/[id]/evidence` | Evidence and provenance | owner |
| `/cases/[id]/runs/[runId]` | Results: scenarios, break-even, sensitivity, trace | owner |
| `/cases/[id]/runs/[runId]/memo` | Memo view/generate | owner |
| `/cases/[id]/runs/[runId]/dossier` | Preview, buy, export | owner |
| `/checkout/return` | Post-PayPal landing: calls EP-023 once, then polls EP-017 (informational shell; carries no authority) | user |
| `/account` | Data export, account deletion (confirmation, paid-loss acknowledgement) | user |
| `/legal/terms`, `/legal/privacy` | Content **OPEN** (legal) | public |

## 3. Component architecture

- **Primitives:** Button, Field, MoneyInput, PercentInput, Select, Table, Badge, Callout, Dialog.
- **Domain components:** `ProvenanceBadge` (user_input / official_fact / estimate / assumption), `ScenarioTable`, `BreakEvenCard`, `SensitivityChart`, `TraceViewer`, `MissingEvidenceList`, `DisclaimerBanner`, `RulePackChip`, `MemoView`, `DossierPreview`, `PaymentStatus`.
- Components are presentational; data loading in route-level server functions; API client in one module.

## 4. State management

Server state via fetch + cache invalidation (e.g., a query library — **OPEN**); form state local to the form; no global client store at MVP. URL carries navigational state (case, run).

## 5. Forms and validation

- Schema shared with the server (Zod, Proposed): same rules, same error codes.
- Money inputs parse decimal text to minor units via a single util (locale-safe, rejects > allowed scale); display via `Intl.NumberFormat`. No floating-point money arithmetic.
- Every numeric field has a provenance selector and optional evidence link; defaults to `user_input`.
- Client validation is a convenience; the server is authoritative.
- Autosave drafts to local state only; **Save** creates a Case Revision (so history is explicit).

## 6. API communication

Typed client; attaches CSRF token; sends `Idempotency-Key` for EP-001/006/008/011/016; maps ERR codes to user messages; never retries non-idempotent calls automatically.

## 7. Loading and error states

| State | Treatment |
|---|---|
| Calculation | Fast; spinner < 1 s; skeleton for results |
| Memo generation | Progress state with "this can take up to a minute"; polling/stream; cancel-safe |
| Payment confirming | Persistent "Confirming your payment…" with polling backoff, timeout copy with order id and support route |
| Errors | Inline field errors; page-level `ErrorBanner` showing correlation id; AI failure shows numbers without memo; PayPal failure offers retry |
| Empty states | Guidance to add evidence; explicit "No evidence provided" markers |

## 8. Accessibility (target WCAG 2.2 AA — NFR-007)

Semantic HTML; labelled inputs; error summary with focus management; colour never the sole carrier (provenance badges use text); keyboard-operable charts with table alternative; reduced-motion respect; focus-visible styles; automated checks in CI plus manual screen-reader pass before launch (doc 22).

## 9. Responsive behaviour

Mobile-first layouts; tables collapse to stacked cards; results use tabs for Low/Base/High on narrow screens; PDF preview downloads rather than embeds on small screens.

## 10. Design system

Carry-over candidate from the predecessor plan: shadcn/ui-style component primitives (doc 01 R-3; **OPEN**, OQ-014).

Tokens (colour, spacing, type scale) in Tailwind config; light/dark **OPEN**; `docs/DESIGN.md` is the living snapshot of what is implemented, while token specification lives with code once scaffolded. Visual identity is **OPEN** (no brand assets known).

## 11. Authentication flows

Sign-in via provider (ADR-011 OPEN); post-sign-in redirect to intended page; session expiry returns to sign-in with a preserved return path; sign-out clears session. Anonymous use before checkout is **OPEN** (OQ-010).

## 12. Payment UX

1. User sees price from `GET /price-points/active`; no price is hard-coded.
2. Click **Buy** → EP-016 (with `Idempotency-Key`) → redirect to the PayPal approval URL (order status `APPROVAL_PENDING`). A JS-SDK button that still calls EP-016 and EP-023 identically is possible (**OPEN** UI detail).
3. Return to `/checkout/return?orderId=<local id>`: the page **ignores every PayPal-appended parameter**, calls `POST /orders/{id}/capture` (EP-023) exactly once, and shows the server's answer; it never shows success on its own.
4. States follow the doc 08 §1 order vocabulary: `200 COMPLETED` → **paid** (entitlement active, export enabled); `202 CAPTURE_REQUESTED` → **confirming** (poll EP-017 with backoff using `retryAfterMs`; never re-issue capture with a new request); `409 ERR-PAY-005` → "You have not finished approving the payment at PayPal" with a button back to the approval URL; `FAILED` / `EXPIRED` → start a new order; `REFUNDED` / `REVERSED` → access revoked notice; long `CAPTURE_REQUESTED` → "still confirming; we will update your dossier page" with the order id for support.
5. Abandoned approval (tab closed): the dossier page shows **Complete payment** while the order is `APPROVAL_PENDING`/`APPROVED` and within its TTL; it calls EP-023 for the same order, because the buyer is present. After expiry the user starts a new order.
6. Copy never says "payment successful" until the server reports `COMPLETED`.

## 13. Dossier preview and export

Preview renders the Markdown dossier with the disclaimer banner and rule/engine versions; paid-only sections are excluded from the preview payload server-side (not merely hidden by CSS). Export buttons (Markdown, PDF) call EP-019; 402 triggers the purchase CTA. Each export shows the content hash and generation timestamp for traceability.
