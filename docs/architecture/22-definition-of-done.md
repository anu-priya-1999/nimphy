# 22 — Definition of Done

A step (doc 17) or feature is **Done** only when every applicable item is satisfied and evidence is recorded in the PR description. "Applicable" is decided by the step's scope; skipping an item requires a written reason. Do not mark done on the basis of intent.

Related: [12](12-testing-and-ai-evaluation.md), [17](17-implementation-roadmap.md), [11](11-security-and-privacy-architecture.md).

## 1. Feature completion

- [ ] Meets the step's acceptance criteria and referenced FR/NFR ids.
- [ ] No scope outside the step; nothing on the exclusion list (doc 02 §6) added.
- [ ] Reviewed (self-review checklist at minimum; second reviewer if available).
- [ ] Committed independently with a clear message.

## 2. Code quality

- [ ] Typecheck, lint, format pass with zero warnings policy (or documented exceptions).
- [ ] Import-boundary check passes (doc 03 §3).
- [ ] No dead code, commented-out code, or unexplained TODOs (TODOs reference an issue/OQ id).
- [ ] No business logic in handlers or components; no arithmetic on money outside `calc-engine`.

## 3. Type safety

- [ ] TypeScript `strict`; no `any` without justification; no unchecked casts at boundaries.
- [ ] External data parsed with schemas (Zod or equivalent) at every boundary.
- [ ] Branded types for ids and money.

## 4. Testing

- [ ] Tests written for new behaviour at the right layers (doc 12 §1).
- [ ] Bug fixes include a regression test.
- [ ] Engine changes: golden, boundary, rounding, determinism tests; 100% branch coverage on `calc-engine`.
- [ ] Coverage thresholds met (targets in doc 12 §2).
- [ ] Tests are deterministic (no real network, clock, randomness without seeds).
- [ ] Verification commands from the step were actually run; output summarised in PR.

## 5. Security

- [ ] Ownership/authorization enforced and tested for any new endpoint or query.
- [ ] Inputs validated; outputs encoded; no secrets in code, logs, or client bundles.
- [ ] Dependencies reviewed; audit/secret scan clean or exceptions recorded.
- [ ] Relevant doc 11 threats (TH-xx) considered and noted.

## 6. Accessibility (UI work)

- [ ] Keyboard operable; visible focus; labelled controls; error summary focus handling.
- [ ] Automated a11y check passes; manual check for new patterns.
- [ ] No information conveyed by colour alone (provenance uses text).

## 7. Error handling

- [ ] Errors mapped to ERR codes (doc 07 §5); no stack traces/internals to clients.
- [ ] Loading, empty, and failure states implemented and tested.
- [ ] Third-party failures degrade as designed (doc 15 §8).

## 8. Documentation

- [ ] `docs/DESIGN.md` updated to reflect the new implementation state (**every step, no exception**).
- [ ] Architecture docs updated if behaviour or decisions changed; ADR added/superseded.
- [ ] Commands in doc 14 corrected to what was actually verified.
- [ ] Docs check passes (§12).

## 9. Observability

- [ ] Meaningful structured logs with correlation id; no sensitive content.
- [ ] Money/security-relevant actions write `audit_log`.
- [ ] New failure modes have an alert or a documented reason for none.

## 10. Deployment readiness

- [ ] Migrations tested from empty and previous schema; forward-compatible with the prior app version.
- [ ] Config/env changes documented in `.env.example` and doc 14.
- [ ] Feature flag/kill switch where the feature touches AI or payments.
- [ ] Rollback path stated.

## 11. Payment verification (any payment-touching step)

- [ ] No code path grants entitlement from a client redirect or client-supplied data; entitlement is granted only in `settleCapture`, in the transaction that sets the order `COMPLETED`.
- [ ] Exactly one use-case calls the PayPal capture operation (EP-023); the webhook handler, sweeper and reconciliation cannot; a structural test enforces it.
- [ ] Webhook signature verified on the raw body before parsing, before storage and before any write; unverified requests leave no row.
- [ ] A duplicate event id is judged by `processing_status`, never by existence; duplicate-after-failed-attempt test passes; retry, lease, concurrency, crash and rollback tests pass (doc 08 §10).
- [ ] Failure paths verified: `FAILED_RETRYABLE` retried, `FAILED_TERMINAL` alerts, unmappable capture events never ignored.
- [ ] Amount, currency, and payee validated against the order snapshot; mismatch ⇒ `REJECTED` and flagged.
- [ ] `PayPal-Request-Id` values are ≤ 38 characters and deterministic; no step relies on PayPal's request-id retention alone.
- [ ] Reconciliation reads but never captures; stuck-event and invariant monitors exist and are tested on seeded data.
- [ ] PayPal facts marked *unverified* in doc 08 §0 that this step depends on are confirmed on the sandbox and the document updated.
- [ ] Sandbox end-to-end run recorded (date, order id).

## 11b. Data lifecycle and deletion (any step touching deletion, users, cases, orders, entitlements or stored files)

- [ ] Deletion follows doc 06 §8: two-phase, resumable, no hard `DELETE` of a case outside the purge path.
- [ ] Foreign keys remain valid after purge (financial links `RESTRICT`/`SET NULL` as in doc 06 §6); tombstone rows hold no PII.
- [ ] `ERR-LIFE-001` (payment in flight) and `ERR-LIFE-002` (paid-access loss unacknowledged) covered by tests.
- [ ] No retention period is hard-coded or asserted; age-based redaction stays disabled until OQ-011 is decided.
- [ ] Restore procedure replays the deletion ledger; resurrection test passes.

## 12. Documentation checks (mechanical)

- [ ] Exactly 23 files `00`…`22` exist in `docs/architecture/` with the exact names listed in doc 00.
- [ ] Order, event and entitlement status names used anywhere equal the vocabulary in doc 08 §1; every referenced ADR, EP, ERR, RISK, OQ and STEP identifier is defined.
- [ ] Internal relative links resolve.
- [ ] Mermaid blocks render (tooling permitting).
- [ ] No document claims product-market fit, customers, revenue, vendor prices, or legal approval.

## 13. AI evaluation (any AI-touching step)

- [ ] Evaluation set run; metrics meet doc 12 §9 gates; report attached.
- [ ] Validator tests updated for any prompt or schema change.
- [ ] Prompt version and model id recorded; budgets and kill switch verified.
- [ ] Confirmed: AI cannot create or alter numbers, inputs, or run results.

## 14. Release criteria (before enabling PayPal **live** or inviting real users)

1. All P0 FRs implemented; NFR targets measured (not assumed) or explicitly waived by the owner.
2. Security review against doc 11 completed; forged-webhook and authorization suites green.
3. Backup restore drill performed and recorded.
4. Real Rule Packs sourced from official documents, with source and retrieval dates; no `TEST_*` packs in production.
5. Illustrative-scenario disclaimers present in UI, memo, and dossier.
6. Terms of service, privacy notice, and refund policy exist, with legal/tax review obtained or the residual risk explicitly accepted in writing (RISK-025).
7. OPEN decisions required for launch (ADR-010/011/012/013/017/018, OQ-004/005/007/011) resolved, and the PayPal facts in doc 08 §0 confirmed on the sandbox.
8. Monitoring and alerts active; kill switches tested.
9. Cost caps configured; fee and AI costs looked up and recorded (doc 16 §7).
10. Owner sign-off recorded.
