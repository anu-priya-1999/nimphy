# 02 — Product Scope and Requirements

Owner of: requirement IDs (FR/NFR), scope, exclusions, open product questions.

Priority key: **P0** = MVP-blocking, **P1** = MVP-desired, **P2** = post-MVP candidate (not scheduled).

## 1. Personas (all hypotheses — *Assumption — not yet validated*)

| ID | Persona | Goal | Pain (hypothesised) |
|---|---|---|---|
| PER-1 | Independent author-publisher | Decide whether a title is worth paying for editing, cover, and print | Unlabelled spreadsheet guesses |
| PER-2 | Small-imprint publisher / editor | Compare title proposals with consistent economics | Inconsistent assumptions across titles |
| PER-3 | Publishing consultant | Deliver a defensible business case to a client | Time spent assembling and formatting |

## 2. User journeys

**J-1 Create and evaluate (PER-1):** sign in → create case → enter inputs → review validation messages → run calculation → compare low/base/high → read break-even and sensitivity → read AI explanation.

**J-2 Buy and export:** preview dossier → start checkout → approve on PayPal → return to Nimphy → see "payment confirming" → entitlement appears after backend verification → export PDF/Markdown.

**J-3 Revise:** edit inputs → a new Case Revision is created → recalculate → compare to previous run. Old dossiers remain reproducible.

## 3. Use cases

| ID | Use case |
|---|---|
| UC-01 | Create a Business Case |
| UC-02 | Edit inputs (creates Case Revision) |
| UC-03 | Attach Evidence Items with provenance |
| UC-04 | Run Calculation (low/base/high) |
| UC-05 | View break-even and sensitivity |
| UC-06 | Generate AI explanation and Memo |
| UC-07 | Preview Dossier |
| UC-08 | Purchase Dossier |
| UC-09 | Export Dossier (PDF/Markdown) |
| UC-10 | View Rule Pack used for a run |
| UC-11 | Delete case and data |

## 4. Functional requirements

| ID | Requirement | Pri | Acceptance criteria (summary) |
|---|---|---|---|
| FR-001 | Create, list, read, archive, delete Business Cases owned by the user | P0 | Another user's case returns 404; deletion is two-phase (doc 06 §8, doc 07 §6): immediate hide (404), asynchronous purge of content and stored files, payment records retained in minimised form; refused while a payment is in flight (`ERR-LIFE-001`); paid access loss needs explicit acknowledgement (`ERR-LIFE-002`) |
| FR-002 | Structured input form: concept (title, genre/category, notes), format(s), marketplace, currency, list price, page count/trim where relevant, production costs, quotes, references | P0 | Schema-validated server-side; field-level errors with codes (doc 07) |
| FR-003 | Each input carries `provenance` ∈ {user_input, official_fact, estimate, assumption} and optional Evidence reference | P0 | Provenance visible in UI, API, calculation trace, and dossier |
| FR-004 | Inputs saved as immutable Case Revisions; calculations bind to one revision | P0 | Editing never mutates a prior revision |
| FR-005 | Deterministic calculation of per-unit economics (royalty, print/unit cost where applicable, contribution) per Rule Pack | P0 | Golden fixtures pass bit-for-bit (doc 12) |
| FR-006 | Low/base/high scenarios defined by explicit user-editable scenario parameters (units sold, price, cost variance) | P0 | Scenario parameters stored with run; labelled "illustrative" |
| FR-007 | Break-even calculation (units and revenue); explicit "not reachable" result when unit contribution ≤ 0 | P0 | Boundary tests: exact break-even, zero, negative contribution |
| FR-008 | Sensitivity analysis: one-at-a-time perturbation of declared drivers; results ranked | P0 | Reproducible; perturbation sizes recorded |
| FR-009 | Versioned Rule Packs with source reference and effective dates; run records pack id + version + engine version | P0 | Run output includes both; superseded packs remain readable |
| FR-010 | Calculation trace: each output links to inputs and rule steps | P0 | Trace JSON available via API and in dossier appendix |
| FR-011 | Missing-evidence report: list fields lacking evidence or relying on estimates/assumptions | P0 | Appears in UI, memo, dossier |
| FR-012 | AI explanation and Memo grounded in Calculation Run output and Evidence Items | P0 | Output validator (doc 09) rejects ungrounded numbers |
| FR-013 | Dossier generation in Markdown and PDF from a specific run + memo | P0 | Deterministic section order; hash stored |
| FR-014 | Free preview of dossier (watermarked or truncated; **OPEN** OQ-004) | P1 | Preview never contains paid-only content |
| FR-015 | PayPal checkout: server creates the order; the buyer approves at PayPal; the **server** performs the single capture (EP-023) after reading PayPal's state; no client-trusted success and no second capture initiator | P0 | Doc 08 §3; single-capture-path test; concurrent double-capture test |
| FR-016 | Webhook endpoint verifies the PayPal signature server-side **before storing**, persists verified events, processes them in a separate atomic transaction with explicit status, retries failures safely, and never treats a duplicate id as proof of success; entitlement granted exactly once | P0 | Doc 08 §5; forged, duplicate-after-failure, concurrent, crash and poison-event tests |
| FR-017 | Export endpoints enforce Entitlement server-side | P0 | 402/403 without entitlement |
| FR-018 | Authentication and per-user data isolation | P0 | Authorization tests (doc 12) |
| FR-019 | Price points configurable (supports $39/$59/$99 experiments) | P1 | No price hard-coded in UI or API |
| FR-020 | Refund/reversal events revoke or flag entitlement per policy (**OPEN** OQ-007) | P1 | State machines in doc 08 §5–6 |
| FR-021 | Audit log of security- and money-relevant actions | P0 | Doc 06 `audit_log` |
| FR-022 | Account data export and two-phase account deletion on request (tombstoned user row, content purge, minimised retained payment records, backups handled by ledger replay) | P1 | Doc 06 §8; retention periods and legal basis **OPEN — requires legal review** |
| FR-023 | Admin/operator tooling for Rule Pack publication and payment reconciliation, minimal and non-public | P1 | CLI or restricted route; **OPEN** form |
| FR-024 | Disclaimer text stating scenarios are illustrative and not guarantees | P0 | Present in UI, memo, dossier |

## 5. Non-functional requirements

| ID | Requirement | Target (*Assumption — not yet validated*) |
|---|---|---|
| NFR-001 | Calculation determinism | Same inputs + rule + engine version ⇒ identical output bytes |
| NFR-002 | Calculation latency | p95 < 500 ms server time (no I/O in engine) |
| NFR-003 | AI memo latency | p95 < 60 s; async-tolerant UI |
| NFR-004 | Availability during early stage | Best effort; no SLA promised |
| NFR-005 | Webhook processing | Retry-safe and idempotent; ack < 5 s; no verified event silently lost (persisted inbox, sweeper, reconciliation); stuck and terminal events detected by monitoring (doc 08 §5.11) |
| NFR-006 | Security baseline | Controls in doc 11 implemented before any real-money launch |
| NFR-007 | Accessibility | WCAG 2.2 AA as a target; audited before launch |
| NFR-008 | Test coverage | Engine: 100% branch coverage; overall gates in doc 22 |
| NFR-009 | Cost | Fixed infra at or near zero until validation passes; AI cost per dossier capped (doc 16) |
| NFR-010 | Observability | Structured logs with correlation IDs; no PII or full prompts in logs by default |
| NFR-011 | Maintainability | Module boundaries enforced by lint rules (doc 03) |
| NFR-012 | Privacy | Data minimisation; retention schedule defined (doc 11) |
| NFR-013 | Portability | No vendor-specific SQL beyond Postgres features documented in doc 06 |
| NFR-014 | Reproducibility | Any dossier can be regenerated from stored revision + run + memo |

## 6. MVP scope and explicit exclusions

**In MVP:** FR-001…FR-018, FR-021, FR-024 (P0 set) plus P1 items as capacity allows.

**Excluded (must not enter silently):**

| Excluded | Reason | Evidence status |
|---|---|---|
| External market-demand scoring | Unvalidated; needs data and methodology | No evidence of demand or method |
| Licensed market-data integrations | Cost and contractual risk | No evidence |
| Keyword research and clustering | Different product (predecessor free-tool idea, doc 01 R-2) | No evidence |
| KDP sales-report upload/import | Requires legal review first | **Legal uncertainty unresolved** (RISK-027) |
| Actual-sales tracking | Post-launch lifecycle, not the wedge | No evidence |
| Research-to-results tracking | Same | No evidence |
| Publishing project management | Out of wedge | **No confirmed demand** for broader publishing workflows |
| Agency/team features | Requires multi-user model | **No confirmed demand**; the predecessor agency tier was a pricing hypothesis only (doc 01 R-1) |
| Subscription billing | Contradicts one-time pricing experiments | **No confirmed demand**; one-time purchase only (owner approval, doc 01 R-1) |
| Complex multi-tenant enterprise functionality | Premature | No evidence |

**Amendment process:** adding anything above requires a new ADR with rationale, an update to this section, and owner approval.

## 7. Assumptions

| ID | Assumption — not yet validated |
|---|---|
| A-1 | Users can supply reasonable production-cost quotes |
| A-2 | A single-currency-per-case model is acceptable at first |
| A-3 | Marketplace scope for MVP is a small, explicit list (**OPEN**, OQ-005) |
| A-4 | Users accept AI-drafted memos if numbers are verifiably from the engine |
| A-5 | PayPal is acceptable to the target buyers (required by the brief; alternatives out of scope) |

## 8. Open product questions

| ID | Question | Status |
|---|---|---|
| OQ-001 | Do the real repository, research register, and validation report exist elsewhere, and do they contradict this package? | OPEN — requires explicit decision |
| OQ-002 | Which persona is the primary buyer? | OPEN |
| OQ-003 | One dossier per case revision, or per case with unlimited regeneration? | OPEN |
| OQ-004 | What is free vs paid (preview vs export)? | OPEN |
| OQ-005 | Which marketplaces and formats are in MVP? | OPEN |
| OQ-006 | Source of truth and refresh cadence for official royalty/cost rules | OPEN |
| OQ-007 | Refund policy and entitlement behaviour on refund/reversal | OPEN |
| OQ-008 | Is a concierge phase (manual dossiers) run before building billing? | OPEN |
| OQ-009 | Tax/VAT handling for sales | OPEN — requires legal/tax advice |
| OQ-010 | Account model: required sign-in before calculation, or anonymous until checkout? | OPEN |
| OQ-011 | How long must orders, payment events, entitlements, audit rows and the tombstone user row be retained after deletion, and do pseudonymous ids count as personal data? | OPEN — requires legal/tax review; no period is asserted |
| OQ-012 | Should deletion have an undo or cooling-off period? (Default proposal: none; explicit confirmation and paid-loss acknowledgement instead.) | OPEN |
| OQ-013 | Is the Apache-2.0 licence the owner approved for the hackathon repository (2026-11-01) confirmed for the Nimphy repository? | OPEN — requires explicit decision |
| OQ-014 | Confirm the carry-over candidates from the predecessor plan (AWS, Drizzle, row-level security, shadcn/ui; doc 01 R-3)? | OPEN — requires explicit decision |

## 9. Prioritisation rationale

P0 is the minimal chain that produces a trustworthy, purchasable, verifiable dossier. Because validation is incomplete, billing automation (FR-015/016) is P0 for the hackathon slice but is flagged in doc 17 as deferrable behind a concierge phase if OQ-008 is decided that way.
