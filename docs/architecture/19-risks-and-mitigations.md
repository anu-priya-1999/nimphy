# 19 — Risks and Mitigations

Scales: **Probability** (L/M/H) × **Impact** (L/M/H/Critical) ⇒ **Severity** (Low/Medium/High/Critical). Ratings are the author's judgment, *not measured*. **Owner** is a role placeholder pending assignment (Product owner = PO, Engineering = ENG, Operator = OPS). **Status:** Open unless stated.

Related: [01](01-executive-summary.md), [11](11-security-and-privacy-architecture.md), [16](16-cost-model.md).

## Product and market-validation

| ID | Risk | P | I | Sev | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|
| RISK-001 | No product-market fit; nobody pays | H | Critical | Critical | Treat as hypothesis; concierge first (H-2); interviews and WTP tests; build P0–P5 before billing automation | PO | Open |
| RISK-002 | Price points $39/$59/$99 mis-set | M | M | Medium | Configurable `price_points`; run as experiments | PO | Open |
| RISK-003 | Title-level cases are one-off need, no repeat use | M | H | High | Test repeat intent (H-3) before investing in retention features | PO | Open |
| RISK-004 | Target buyer segment unclear | H | M | High | Resolve OQ-002 via interviews | PO | Open |
| RISK-005 | Source research register/validation report not found; package may contradict existing decisions; owner-stated predecessor plans (subscriptions, agency tier, free tools) conflict with the current brief | M | M | Medium | Evidence register and conflict table (doc 01 §12), precedence rule (ADR-022), reconcile on approval (ADR-016, OQ-001) | PO/ENG | Open |
| RISK-006 | Scope creep into excluded features | M | H | High | Exclusion list + ADR amendment rule (doc 02 §6); step scope checks | ENG | Open |

## Technical

| ID | Risk | P | I | Sev | Mitigation | Owner |
|---|---|---|---|---|---|---|
| RISK-007 | Serverless limits break PDF/AI | M | M | Medium | Choose renderer to fit; fallback to container host (ADR-010/012); jobs table trigger | ENG |
| RISK-008 | Vendor lock-in | L | M | Low | Ports/adapters; portable Postgres | ENG |
| RISK-009 | Module boundaries erode | M | M | Medium | Lint boundaries in CI (STEP-002) | ENG |
| RISK-010 | Unverified stack assumptions (no repo evidence) | M | M | Medium | STEP-001 verifies; doc 14 flagged `[UNVERIFIED]` | ENG |

## Financial calculation

| ID | Risk | P | I | Sev | Mitigation | Owner |
|---|---|---|---|---|---|---|
| RISK-011 | Wrong or outdated royalty/cost rules | H | Critical | Critical | Official sources only, dated; version + effective windows; show rule ref in output; operator review; expiry warnings | PO/OPS |
| RISK-012 | Rounding/boundary defects | M | H | High | Golden fixtures, boundary + property + differential tests, mutation testing | ENG |
| RISK-013 | Users read scenarios as forecasts | H | H | High | Illustrative labelling (FR-024, INV-12) in UI/memo/dossier; terms | PO |
| RISK-014 | Garbage-in outputs | H | M | High | Provenance, missing-evidence report, range validation | PO/ENG |

## AI

| ID | Risk | P | I | Sev | Mitigation | Owner |
|---|---|---|---|---|---|---|
| RISK-015 | AI states ungrounded numbers | M | Critical | High | Number tokens + validator; fail closed; eval gates | ENG |
| RISK-016 | Prompt injection via evidence text | M | M | Medium | No tool access, validator, delimited data | ENG |
| RISK-017 | AI cost overrun | M | M | Medium | Caps, caching, kill switch, measured tokens | ENG/OPS |
| RISK-018 | Free-tier limits invalidate architecture | M | M | Medium | Verify limits early (doc 16 §4); Option B fallback | ENG |
| RISK-019 | PayPal fees erode margin at low price | M | M | Medium | Compute unit economics (doc 16) before pricing | PO |
| RISK-020 | Provider data-retention terms conflict with user expectations | M | H | High | Review terms; minimise data sent; disclose | PO |

## Security and payments

| ID | Risk | P | I | Sev | Mitigation | Owner |
|---|---|---|---|---|---|---|
| RISK-021 | Forged/replayed webhook grants access | L | Critical | High | Verification before storage, unique ids plus `processing_status`, `settleCapture` validation, tests (doc 08, 12) | ENG |
| RISK-022 | Paid user not granted access (capture response lost, webhook delayed or failed) | M | H | High | Three evidence sources into one `settleCapture`; persisted inbox with retries; reconciliation reads; polling UX; operator runbook (doc 08) | ENG/OPS |
| RISK-023 | IDOR / data exposure | M | Critical | High | Ownership predicates, authz matrix tests, optional RLS | ENG |
| RISK-024 | Secrets leaked | L | Critical | High | Secret manager, scanning, rotation | ENG |
| RISK-025 | Legal/compliance uncertainty: terms, privacy law, tax/VAT, refund obligations, retention periods for orders, payment events, entitlements and audit rows, marketplace-rule usage rights; **no legal assessment exists** | H | H | High | Obtain legal/tax advice before real-money launch (OQ-009, OQ-011); no compliance claims in product copy; no age-based deletion of retained records until decided | PO |
| RISK-026 | Refund/chargeback handling undefined | M | M | Medium | Decide OQ-007; state machine supports refund/reversal | PO |
| RISK-027 | KDP-sourced data ingested without legal review | L | H | Medium | Excluded from MVP; ADR needed to add | PO |

## Operational

| ID | Risk | P | I | Sev | Mitigation | Owner |
|---|---|---|---|---|---|---|
| RISK-028 | Data loss / no restore tested | L | Critical | High | Backups + restore drill including deletion-ledger replay (STEP-032) | OPS |
| RISK-029 | Single-person bus factor | H | M | High | Documentation (this package), `DESIGN.md` per step, automation | PO |
| RISK-030 | Rule Pack maintenance burden outpaces capacity | M | M | Medium | Narrow marketplace scope (OQ-005); tooling for publishing | OPS |
| RISK-031 | Outages in PayPal/AI/IdP | M | M | Medium | Degradation ladder (doc 15 §8), kill switches | ENG |
| RISK-032 | Demo overstates implemented capability | M | M | Medium | Implemented vs planned separation (doc 21) | PO |

## Added in 0.3.0 (correction pass)

| ID | Risk | P | I | Sev | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|
| RISK-033 | Double capture / double charge of one buyer | L | Critical | High | Single capture initiator (EP-023) enforced structurally; compare-and-set under order lock; deterministic `PayPal-Request-Id` (≤ 38 chars); read-before-retry; tests (doc 08 §3, §10) | ENG | Open |
| RISK-034 | A valid payment event is lost, stuck or never settled (processing failure, unmappable payload, scheduler too coarse) | M | Critical | High | Persisted inbox, lease and attempt budget, sweeper, terminal-failure alerts, unmappable capture events never ignored, invariant queries, S3 reads; verify payload field locations on real sandbox events at STEP-027 | ENG/OPS | Open |
| RISK-035 | Deletion leaves orphaned or retained personal data, blocks on foreign keys, or deleted data reappears after a restore | M | H | High | Two-phase deletion, `RESTRICT`/`SET NULL` design, tombstone `CHECK`, resumable purge, deletion ledger replayed on restore, deletion test suite (doc 06 §8, doc 12 §5) | ENG/OPS | Open |
| RISK-036 | Pseudonymous ids in audit rows and the tombstone user row may still count as personal data; retention periods unknown | M | M | Medium | Ids and codes only in audit; no PII in tombstone; legal review (OQ-011); no retention period asserted | PO | Open |
| RISK-037 | Conversion loss: a buyer who approves at PayPal and leaves is not charged (no capture without a present, authenticated buyer) | M | M | Medium | "Complete payment" path for the same order within TTL; measure abandonment during the concierge/sandbox phase; revisit ADR-020 if material | PO | Open |
| RISK-038 | PayPal behaviours not verifiable from the pages read (approved-order validity window, webhook payload field locations, verification response values, request-id retention) differ from assumptions | M | M | Medium | Doc 08 §0 marks each as unverified; confirm on sandbox at STEP-025 to STEP-027; no design step relies on them alone | ENG | Open |
