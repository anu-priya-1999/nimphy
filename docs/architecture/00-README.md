# 00 — Nimphy Architecture Package: README

| Field | Value |
|---|---|
| Package version | 0.3.0-draft |
| Date | 2026-11-04 (this revision); first issued 2026-11-03 |
| Architecture status | **DRAFT — awaiting explicit owner approval.** No implementation has started. |
| Product validation status | **VALIDATE FURTHER** (per the market-validation report as described in the task brief; the report itself was unavailable — see §6) |

## 1. Purpose

This package is the canonical product and technical architecture for **Nimphy**. It is written so that a senior engineer, or an AI coding agent, can implement the system step by step without re-deciding foundational questions. It is architecture documentation only. No application code, scaffolding, or configuration has been created.

## 2. Product overview

Nimphy is a publishing business-case and decision-intelligence product. The initial wedge is the **Title Business Case**:

1. A user enters a book concept and publishing details (format, marketplace, list price, production costs, quotes, research references).
2. A deterministic engine calculates publishing economics under low/base/high scenarios, break-even, and sensitivity.
3. Inputs, assumptions, estimates and official facts are recorded separately.
4. AI explains the calculated results and drafts a structured memo. AI never produces or alters numbers.
5. The user exports a **dossier** (PDF + Markdown). Dossiers are purchased via PayPal; the backend verifies payment via authenticated webhooks and grants an entitlement.

Nimphy does **not** have product-market fit. Every commercial statement in this package is a hypothesis (see doc 01 and doc 19).

## 3. Document index

| # | File | Purpose |
|---|---|---|
| 00 | [00-README.md](00-README.md) | This file |
| 01 | [01-executive-summary.md](01-executive-summary.md) | Vision, wedge, validation status, key decisions |
| 02 | [02-product-scope-and-requirements.md](02-product-scope-and-requirements.md) | FR/NFR, personas, journeys, MVP scope and exclusions |
| 03 | [03-architecture-principles.md](03-architecture-principles.md) | Principles and constraints |
| 04 | [04-system-architecture.md](04-system-architecture.md) | Context, containers, trust boundaries, data flows |
| 05 | [05-component-responsibilities.md](05-component-responsibilities.md) | Module contracts |
| 06 | [06-database-architecture-and-schema.md](06-database-architecture-and-schema.md) | Schema, constraints, lifecycle |
| 07 | [07-api-architecture.md](07-api-architecture.md) | Endpoints, errors, idempotency |
| 08 | [08-event-schema-and-payment-lifecycle.md](08-event-schema-and-payment-lifecycle.md) | Events, PayPal lifecycle, entitlements |
| 09 | [09-ai-architecture.md](09-ai-architecture.md) | AI boundaries, prompts, validation |
| 10 | [10-frontend-architecture.md](10-frontend-architecture.md) | Routes, components, UX states |
| 11 | [11-security-and-privacy-architecture.md](11-security-and-privacy-architecture.md) | Threat model and controls |
| 12 | [12-testing-and-ai-evaluation.md](12-testing-and-ai-evaluation.md) | Test strategy, fixtures, CI gates |
| 13 | [13-deployment-and-infrastructure.md](13-deployment-and-infrastructure.md) | Environments, CI/CD, rollback |
| 14 | [14-local-development.md](14-local-development.md) | Local setup (unverified commands flagged) |
| 15 | [15-scaling-and-reliability.md](15-scaling-and-reliability.md) | Workload, retries, scaling triggers |
| 16 | [16-cost-model.md](16-cost-model.md) | Cost framework (no invented prices) |
| 17 | [17-implementation-roadmap.md](17-implementation-roadmap.md) | Ordered, committable steps |
| 18 | [18-architecture-decision-records.md](18-architecture-decision-records.md) | ADR-001… |
| 19 | [19-risks-and-mitigations.md](19-risks-and-mitigations.md) | Risk register |
| 20 | [20-senior-engineering-interview-preparation.md](20-senior-engineering-interview-preparation.md) | Interview Q&A on this architecture |
| 21 | [21-hackathon-and-product-demo.md](21-hackathon-and-product-demo.md) | Demo script, implemented vs planned |
| 22 | [22-definition-of-done.md](22-definition-of-done.md) | Completion gates |

## 4. Reading order

- **First pass (new engineer):** 01 → 02 → 03 → 04 → 05.
- **Before building data/API:** 06 → 07 → 08.
- **Before building AI:** 09 → 12.
- **Before implementing anything:** 17 → 22 → 18 (decisions still OPEN).
- **Before shipping or demoing:** 11 → 13 → 19 → 21.

## 5. Source-of-truth hierarchy

When documents disagree, the higher item wins, and the disagreement must be recorded as a defect.

1. `AGENTS.md` — permanent repository-wide engineering and agent instructions. **Not found; see §6.**
2. `docs/architecture/` — canonical product and technical architecture (this package).
3. `docs/DESIGN.md` — living implementation state and current snapshot. It is updated after **every** implementation step. It is not a substitute for this package. **Not found.**
4. `docs/adr/` — detailed ADR files, if adopted. This package keeps ADRs in doc 18; separate files are **OPEN** (ADR-016).
5. `learning/` — learning notes and experiments.
6. `prompts/` — reusable AI prompts (runtime prompts live in code per doc 09).

Within this package, each fact has exactly one owning document (table below). Other documents link to it rather than restate it.

| Topic | Owning document |
|---|---|
| Requirements (FR/NFR) | 02 |
| Module responsibilities | 05 |
| Tables and constraints | 06 |
| Endpoints and error codes | 07 |
| Events and payment state machine | 08 |
| AI rules and prompts | 09 |
| Decisions | 18 |
| Risks | 19 |
| Implementation order | 17 |
| Completion criteria | 22 |
| Source reconciliation (research evidence, predecessor planning inputs, conflicts) | 01 §12 |
| Payment, order, event, entitlement state names | 08 §1 (all other documents must use these names verbatim) |

**When sources conflict (rule recorded as ADR-022, Proposed):**
1. The owner's current explicit written instruction governs over any earlier document or plan.
2. For *commercial and market facts*, the market-validation report and the research/decisions register govern over this package; this package may not assert anything they do not support (and where they were unavailable, it asserts nothing beyond the task brief).
3. For *technical architecture*, this package governs over `docs/DESIGN.md`, earlier plans and predecessor-concept notes.
4. For *implementation state*, `docs/DESIGN.md` governs.
5. A conflict these rules cannot settle is listed in doc 01 §12 and in doc 18 as OPEN for the owner. Documents are never silently reconciled.

## 6. Source material inspected (honest inventory)

| Item requested by the brief | Result |
|---|---|
| Repository structure | **Unavailable.** Working directory `/home/claude` was empty of project files and is not a git repository. |
| `AGENTS.md` | **Not found.** |
| `docs/DESIGN.md` | **Not found.** |
| Existing files under `docs/` | **None found.** |
| Nimphy research register | **Not found.** Filesystem search for `*nimphy*`, `*research-register*` returned nothing. |
| Nimphy market-validation report | **Not found.** Its "VALIDATE FURTHER" verdict is taken from the task brief only, not verified against the report. |
| Package manifests, configs, source code | **None found.** |
| Existing ADRs, research and decisions register, other product documentation | **None found** (searched the whole workspace filesystem on 2026-11-03 and again on 2026-11-04). |
| Git history | **Unavailable.** The workspace is not a git repository (re-checked 2026-11-04). |
| Earlier owner statements about the predecessor concept ("Kindle Intelligence", renamed Nimphy on 2026-11-02) | **Not files.** Recorded in doc 01 §12 as *owner-stated planning inputs*, reconciled there, and never treated as verified documents. |

Consequences: no prior decisions could be preserved from files, no document-to-document contradictions could be audited, and the technology stack is **not established in any file**. Every stack choice here is a **Proposed** ADR (doc 18). Conflicts between the owner-stated predecessor plans and the current brief are listed with a governing source in doc 01 §12. If the real repository and reports exist elsewhere, this package must be reconciled against them before approval (ADR-016, open question OQ-001 in doc 02).

## 7. Conventions

- **Status labels:** `Accepted`, `Proposed`, `OPEN`. Unknown decisions read: `Status: OPEN — requires explicit decision.` Unvalidated assumptions read: `Assumption — not yet validated.`
- **Identifiers:** `FR-###`, `NFR-###`, `UC-##`, `EP-###` (endpoints), `ERR-###` (errors), `EVT-` event names (`domain.entity.action.v1`), `TBL-` tables, `ADR-###`, `RISK-###`, `STEP-###`, `AIR-##` (AI rules), `INV-##` (invariants).
- **Terminology (use exactly):** *Business Case*, *Case Revision* (immutable input snapshot), *Rule Pack* (versioned publishing rules), *Calculation Run*, *Scenario* (low/base/high), *Evidence Item*, *Memo*, *Dossier*, *Order*, *Entitlement*, *Payment Event*.
- **Money:** integer minor units plus ISO-4217 currency code, everywhere.
- Examples containing numbers are **synthetic** and are not real marketplace rates.

## 8. Financial and AI invariants (owned here, enforced elsewhere)

| ID | Invariant |
|---|---|
| INV-01 | Financial calculations are deterministic and pure. |
| INV-02 | The calculation engine is independently testable with no I/O. |
| INV-03 | AI never invents financial numbers. |
| INV-04 | AI never overrides engine results. |
| INV-05 | AI never silently modifies user inputs. |
| INV-06 | Every financial output is traceable to inputs and rule version. |
| INV-07 | Inputs, official facts, estimates, assumptions stay distinguishable (`provenance`). |
| INV-08 | Royalty math uses versioned, documented Rule Packs. |
| INV-09 | Each Calculation Run records the Rule Pack version and engine version. |
| INV-10 | AI explanations state uncertainty and limitations. |
| INV-11 | Missing evidence is communicated explicitly. |
| INV-12 | Illustrative scenarios are never presented as guaranteed outcomes. |
| INV-13 | Payment is proven only by a PayPal fact obtained **server-side over an authenticated channel**: our own capture response, a signature-verified webhook, or our own authenticated read from PayPal (doc 08 §4). A client redirect or any browser-supplied value proves nothing. An entitlement is granted exactly once, in the transaction that sets the order `COMPLETED`. A duplicate webhook id is never proof that processing succeeded. |

## 9. Maintenance

- Change architecture by editing the owning document and, where a decision changes, adding or superseding an ADR in doc 18. Never silently edit an `Accepted` ADR.
- Bump the package version and add a line to the changelog below.
- After each implementation step: update `docs/DESIGN.md` (living state), not this package, unless the architecture changed.
- Run the doc checks in doc 22 §12 (link and filename checks) before approving any change.

### Changelog

| Version | Date | Change |
|---|---|---|
| 0.1.0-draft | 2026-11-03 | Initial package created from task brief only; no repository sources available. |
| 0.2.0 (not authored in the 0.3.0 pass) | 2026-11-03 | Revisions to docs 06 and 08 (two-phase deletion, webhook inbox, canonical capture) were found on disk at the start of 0.3.0; author and review history are not recorded; they were reviewed, not rewritten. |
| 0.3.0-draft | 2026-11-04 | Correction pass: A (evidence reconciliation, doc 01 §12, ADR-022), B (webhook retry-safe lifecycle, ADR-019), C (deletion lifecycle, ADR-021), D (canonical capture, ADR-020; ADR-008 superseded); defects found in the 0.2.0 text fixed (doc 08 header); cross-document consistency edits to docs 00–07 and 09–22; roadmap steps 024–033 re-sequenced. |
