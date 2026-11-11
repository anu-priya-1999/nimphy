# 20 — Senior Engineering Interview Preparation (Nimphy-specific)

Purpose: rehearse explaining *this* architecture. Answers describe the **designed** system (doc references given). Nothing is implemented yet, so in a real interview say "I designed…", not "I built…", until the roadmap steps are done. Do not claim customers, revenue, or measured performance: none exist.

## 1. System design

**Q1. Walk me through the architecture in two minutes.**
A modular monolith: one Next.js deployable with thin route handlers over use-case modules; a pure `calc-engine` for money; versioned `rules`; an `ai` module behind a port; `documents` for Markdown/PDF; `payments` for PayPal; Postgres as the only datastore. I avoided microservices because the product is unvalidated and the boundaries I need are enforced by import rules, not networks (doc 04, ADR-001).

**Q2. Why a monolith, and when would you split?**
Cost, operability, and one transactional store for orders/entitlements. Documented triggers: platform time limits for PDF/AI, DB saturation, team size. First extraction candidate is document rendering because it has the heaviest resource profile and a clean port (doc 15 §9).

**Q3. How do you stop the modules from turning into a ball of mud?**
Dependency rule pointing inward to `domain`, enforced by lint and a CI check (STEP-002); handlers contain no business logic; adapters contain no business rules.

## 2. Database design

**Q4. Which tables are immutable and why?**
`case_revisions`, `calculation_runs`, published `rule_packs`, `payment_events`, `audit_log`. Reproducibility and audit require that history cannot change; enforced by triggers or revoked privileges and tested (doc 06 §5).

**Q5. How do you guarantee one entitlement per payment?**
`entitlements.order_id` is unique, every evidence source (my own capture response, a verified webhook, a reconciliation read) goes through one `settleCapture` that locks the order row, and grants use insert-on-conflict-do-nothing in the same transaction that sets the order `COMPLETED`. The constraint is the last line of defence even if code is wrong, and a property test checks every interleaving of the three sources.

**Q6. How do you handle schema evolution of user inputs?**
`inputs_schema_version` on revisions; old revisions are never rewritten; migrations produce new revisions on demand.

## 3. Financial calculation integrity

**Q7. How do you ensure the numbers are right?**
Integer minor units, pure functions, rounding mode declared by the rule pack, golden fixtures with independently derived expectations, boundary and property tests, a differential reference check, and mutation testing. Honest caveat: correctness of *rules* depends on sourcing official documents, which is an operational process, not a code guarantee (RISK-011).

**Q8. Why not floats / why not a decimal library everywhere?**
Floats break reproducibility and rounding semantics; integer minor units give exact arithmetic and trivial serialisation. Where intermediate precision is needed it's contained inside the engine (ADR-005).

**Q9. How is a number traceable?**
Each result has a trace linking to input fields (with provenance) and rule steps; each run stores rule pack id/version, engine version, scenario params and results hash (INV-06/09).

**Q10. How would you handle a rule change by the marketplace?**
Publish a new immutable rule pack version with an effective window; old runs remain reproducible; UI shows which pack a run used; operator process includes source and retrieval date.

## 4. Payment lifecycle and webhook security

**Q11. A user returns from PayPal and says "I paid". What happens?**
Nothing is granted on the redirect. The return page only asks my server to capture (EP-023); the server ignores the URL parameters, reads the order from PayPal with its own credentials, validates approval, amount, currency and payee, captures once, and grants the entitlement only after validating the result. If that response is lost, a verified webhook or a reconciliation read settles the same order through the same function, so the buyer is never charged without an entitlement and never granted one twice (doc 08 §3–4). The weak point I'd call out is conversion: a buyer who approves and closes the tab isn't charged (RISK-037).

**Q12. How do you verify a webhook?**
Raw body, PayPal transmission headers, PayPal's verification API with our webhook id, host allow-list for any certificate URL, then parse. Failure ⇒ 400 and no state change; verifier outage ⇒ 503 so PayPal retries. Only verified events are ever stored. (The verification response field and payload field locations are unverified and get confirmed on real sandbox events during STEP-027; doc 08 §0.)

**Q13. Duplicates, replays, out-of-order?**
The unique `paypal_event_id` only identifies the notification; it is **not** proof it was processed. I originally treated a duplicate id as done, which loses a payment if the first attempt failed after the row was stored. Now the inbox has an explicit `processing_status`: a duplicate of a final event is a no-op, a duplicate of a failed or unfinished one is claimed with a lease and retried, concurrent deliveries are serialised by the lease and the order row lock, failures roll back atomically and are recorded, and a sweeper retries independently of PayPal's 25-attempts-over-3-days window. Poison events become `FAILED_TERMINAL` with an alert and an operator runbook (doc 08 §5).

**Q14. Where could the price be tampered with?**
Nowhere client-side: the API accepts no amount; price comes from `price_points`, snapshotted on the order and compared against the webhook amount.

## 5. AI orchestration

**Q15. How do you stop the model inventing numbers?**
It never gets to write numbers: it cites number tokens; a validator rejects any numeral not resolvable to the run; the renderer substitutes canonical values; failure is closed (doc 09 §6–7). The model is also unable to call tools or write data.

**Q16. What about prompt injection in user evidence text?**
Evidence is untrusted data in delimited blocks, the AI has no privileges, and the output validator is the real control. I treat prompt wording as defence-in-depth only.

**Q17. How do you evaluate AI quality?**
Synthetic dataset with adversarial cases; metrics for grounding, prohibited language, uncertainty and gap coverage, injection resistance, cost, latency; gates on prompt/model change (doc 12 §9). Deterministic validator unit-tested exhaustively; provider variability handled by repeated runs and rate gates.

## 6. Reliability, scaling, testing

**Q18. What happens when the AI provider is down?**
Numbers and trace still work; memo returns ERR-AI-001; retries bounded; kill switch available (doc 15 §7–8).

**Q19. Where would it break first at 100× load?**
Likely platform time limits on PDF/AI, then DB connections. Response is ordered in doc 15 §9 — jobs table before any broker.

**Q20. What's your testing strategy for payments without hitting PayPal live?**
Fake port, recorded sandbox payloads, forged/replayed/reordered/mismatch suites, race tests on concurrent delivery, plus a manual sandbox E2E before release.

## 7. Trade-offs, security, cost

**Q21. A trade-off you made that you're unsure about?**
Number-token grounding constrains prose but gives a mechanical guarantee; if evaluation shows it hurts quality too much, I'd revisit (ADR-007). Another: synchronous memo generation is simple but risks timeouts.

**Q22. Top three security controls?**
Server-side payment verification; ownership predicates on every query with authorization tests; AI treated as untrusted with output validation. Plus no card data stored, SSRF avoidance, scoped secrets (doc 11).

**Q23. How do you keep costs low?**
Single deployable, managed Postgres free/low tier where limits permit, no always-on workers, capped and cached AI usage, concierge validation before automation. I haven't priced anything yet; prices must be looked up and dated (doc 16).

**Q24. What would you do differently if the product fails validation?**
The engine, rule-pack mechanism, and verified-payment pattern are reusable; I deliberately sequenced billing after the deterministic core so little is sunk before evidence arrives.

**Q25. How do you talk about limitations honestly?**
Say the verdict is "validate further", the stack is proposed, no real rule data is loaded, and the demo shows only what is implemented (doc 21).

## 8. Added in 0.3.0 (deletion, retries, capture)

**Q26. How can a user delete their data when you must keep payment records?**
Two-phase deletion. Phase 1 is one transaction: hide the case or account (404 everywhere), revoke entitlements, expire unpaid orders; it is refused while a capture is in flight. Phase 2 is a resumable purge: files, content rows by cascade, payer data redacted from raw webhook bodies, identity deleted, and the user row removed or, if orders exist, tombstoned with no PII. Foreign keys make that valid: financial links are `RESTRICT` to the tombstone, case links are `SET NULL`, and a `CHECK` prevents purging a case that still has an active entitlement. I don't claim retention periods; those need legal review (doc 06 §8).

**Q27. What about backups?**
Deleted data lives in backups until they expire, so I keep an ids-only deletion ledger outside the database and replay it on every restore before serving traffic. A restore without replay is a defect.

**Q28. Why does only one endpoint capture payments?**
Because the failure I fear most is a second, uncontrolled capture path. Webhooks and reconciliation can read and settle but have no access to the capture operation, which a structural test enforces. EP-023 is owner-only, uses a compare-and-set under the order lock, and a deterministic UUID request id within PayPal's 38-character limit; after an ambiguous result it reads PayPal first and never blindly retries (doc 08 §3).

**Q29. What did you find wrong in your own first design?**
Five things: duplicate-id-means-done in the webhook path; cascade deletion colliding with non-null payment foreign keys; no defined capture trigger; request ids longer than PayPal allows; and a `CAPTURE_REQUESTED` order with no exit if the buyer never returned. Each is now a documented decision or test (ADR-019 to ADR-021; doc 08 header).
