# 03 — Architecture Principles

Related: [04](04-system-architecture.md), [05](05-component-responsibilities.md), [18](18-architecture-decision-records.md).

## 1. Principles

| ID | Principle | Consequence |
|---|---|---|
| P-01 | **Deterministic core, probabilistic edge.** Money logic is pure code; AI only narrates. | `packages/calc-engine` has no I/O and no AI imports |
| P-02 | **Simplicity first.** Modular monolith; add infrastructure only on a documented trigger. | No queues, caches, or services at MVP unless doc 15 triggers fire |
| P-03 | **Traceability.** Every number links to inputs, rule version, engine version. | Calculation Run stores trace |
| P-04 | **Immutability for evidence.** Revisions, runs, published rule packs and audit rows are immutable; payment events are append-only except their processing and redaction columns. | No UPDATE on those rows except the columns named in doc 06 §5 |
| P-05 | **Verify at the boundary.** Validate all input; verify all payment claims server-side. | Zod schemas at API edge; webhook verification before any state change |
| P-06 | **Least privilege and default deny.** | Authorization check in every handler; ownership in every query |
| P-07 | **Honest uncertainty.** | Provenance labels, missing-evidence report, illustrative disclaimers |
| P-08 | **Cost-aware.** Prefer free tiers and managed services with exit paths. | Per-dossier AI budget; prices are not assumed (doc 16) |
| P-09 | **Testability.** Pure functions, dependency injection at module edges. | Fakes for PayPal and AI provider |
| P-10 | **Reversibility.** Prefer decisions that are cheap to change. | Provider interfaces for AI, storage, PDF |

## 2. Design constraints

- Early-stage, small team (assumed one primary developer — *Assumption — not yet validated*).
- Validation incomplete: avoid large sunk cost.
- PayPal is the required payment provider (from the brief).
- Scope exclusions in doc 02 §6 are binding.
- No repository stack exists to preserve; stack is proposed (ADR-002).

## 3. Modularity and domain boundaries

Bounded areas (each is a package/folder with an explicit public `index.ts`):

| Area | Responsibility | May depend on |
|---|---|---|
| `domain` | Types, value objects (Money, Provenance), invariants | nothing |
| `calc-engine` | Pure calculations | `domain` |
| `rules` | Rule Pack schema, loader, validation | `domain` |
| `cases` | Case/Revision use-cases | `domain`, `rules`, `calc-engine`, persistence port |
| `ai` | Prompt building, provider port, output validation | `domain` |
| `documents` | Dossier assembly, Markdown/PDF rendering | `domain` |
| `payments` | PayPal adapter, order/capture/settlement/webhook-inbox use-cases | `domain`, persistence port |
| `lifecycle` | Two-phase case/account deletion and purge | `domain`, persistence port (purge role), storage port, `payments` public interface |
| `persistence` | DB access, migrations | `domain` |
| `web` | UI + route handlers (thin) | all via use-case functions |

**Dependency rule:** arrows point inward toward `domain`. `calc-engine` and `domain` must not import from `ai`, `payments`, `persistence`, or any framework. Enforced by lint (import boundaries) and a CI check (doc 22).

## 4. Separation of concerns

- Route handlers parse, authorise, call a use-case, map errors. No business logic.
- Use-cases orchestrate; they do not do arithmetic.
- Adapters (PayPal, AI provider, PDF renderer, storage) implement ports and contain no business rules.
- Rendering never recalculates numbers; it formats stored results.

## 5. Data ownership

Each table has one owning module (doc 06 §3). Other modules read via that module's public interface, not by joining its tables ad hoc in unrelated code. Payment-owned tables are written only by `payments`; deletion status columns are written only by `lifecycle`; multi-table transactions follow the lock order in doc 06 §7.

## 6. Security principles

Defence in depth; secrets never in client bundles; ownership check in every query; verify-before-trust for webhooks; AI treated as an untrusted component whose output is validated; minimal logging of user content. Detail in doc 11.

## 7. Reliability

Idempotent, retry-safe webhook handling (a duplicate id is never proof of successful processing; stored `processing_status` decides, doc 08 §5); a single capture initiator; unique constraints as the final guard; timeouts and bounded retries on all outbound calls; reconciliation job for payments; graceful degradation when AI is down (numbers still available). Detail in doc 15.

## 8. Observability

Structured logs, correlation ID per request, domain event log for money-relevant transitions, error tracking, minimal metrics. No full prompt or PII logging by default. Detail in doc 13.

## 9. Cost-conscious engineering

Single deployable, managed Postgres free/low tier, no always-on workers at MVP, AI calls capped per dossier, regenerate-on-demand limits. No vendor prices are asserted here (doc 16).

## 10. Testability

Engine: property and golden tests. Payments: recorded sandbox payloads. AI: evaluation datasets with automatic number-grounding checks. Detail in doc 12.

## 11. Evolution strategy

Extraction order if scaling forces it (not planned): (1) document rendering worker, (2) AI memo worker, (3) payments webhook receiver. Each already sits behind a port. No extraction without a trigger from doc 15 §9 and a new ADR.
