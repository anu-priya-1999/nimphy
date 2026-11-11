# Nimphy Master Product Vision and Strategy

**Document Status:** DRAFT — Awaiting Owner Review & Canonical Approval
**Role Context:** Strategic Product Architecture, Publishing Technology & Engineering Alignment
**Implementation Anchor:** Step 003 Complete (Domain Primitives Hardened & Verified)

---

## 1. Product Vision & Strategic Positioning

### 1.1 Executive Definition

Nimphy is an **End-to-End Publishing Intelligence Platform** designed to help professional independent publishers and publishing businesses discover book opportunities, validate commercial potential, make rigorous investment decisions, plan and create books, prepare them for publication, and optimize publishing portfolios.

Nimphy connects the entire publishing journey into a closed-loop system:

```
NIMPHY CLOSED-LOOP PUBLISHING INTELLIGENCE PLATFORM (STRATEGIC VISION):
             ┌──────────────────────────┐
             │       1. DISCOVER        │
             │                          │
             │ Market Voids & Audiences │
             └────────────┬─────────────┘
                          │
                          ▼
             ┌──────────────────────────┐
             │       2. VALIDATE        │
             │                          │
             │ Comparables, Demand      │
             │ & Unit Signals           │
             └────────────┬─────────────┘
                          │
                          ▼
             ┌──────────────────────────┐
             │      3. UNDERWRITE       │
             │                          │
             │ Deterministic Economics  │
             └────────────┬─────────────┘
                          │
                          ▼
             ┌──────────────────────────┐
             │        4. CREATE         │
             │                          │
             │ Structured, Research-Led │
             └────────────┬─────────────┘
                          │
                          ▼
             ┌──────────────────────────┐
             │        5. PRODUCE        │
             │                          │
             │ Compliant Assets &       │
             │ Metadata                 │
             └────────────┬─────────────┘
                          │
                          ▼
             ┌──────────────────────────┐
             │       6. OPTIMIZE        │
             │                          │
             │ Actuals vs Projections   │
             └────────────┬─────────────┘
                          │
                          │
                          ▼
          Portfolio Learning & Backlist
                    Feedback Loop
                          │
                          │
                          └───────────────↗
                                  │
                                  └─────── Back to 1. DISCOVER
```

Nimphy is **not** a generic one-click AI book generator, not an Amazon KDP royalty calculator, not a keyword research utility, and not an ungrounded chatbot. It is an integrated business decision and execution platform.

### 1.2 Core Product Philosophy: The Six Publishing Decisions

The platform is architected around six sequential questions that every commercial publishing business must answer:

1. **What should we publish? (DISCOVER):** Identifying unmet reader demand, structural voids in retailer categories, underserved topics, and differentiated positioning angles.
2. **Is this book opportunity worth pursuing? (VALIDATE):** Investigating customer willingness to pay, competitor pricing elasticity, category velocity, review sentiment gaps, and comparable title benchmarks using transparent, cited evidence.
3. **Under what financial conditions does it succeed? (UNDERWRITE — Initial MVP Wedge):** Calculating production capital break-even, unit contribution across formats, margin sensitivity, and pessimistic/expected/optimistic scenarios before spending money.
4. **How should we architect and create it? (CREATE):** Translating the validated concept into chapter-level architecture, audience-aligned value propositions, research citations, and human-in-the-loop drafted prose.
5. **How should we package and publish it? (PRODUCE):** Preparing publication-ready interior formatting (EPUB/PDF), retailer-compliant metadata, category taxonomy selections, and high-converting book descriptions.
6. **How should we optimize our publishing portfolio? (OPTIMIZE):** Measuring actual unit sales and royalties against underwritten projections, identifying catalog decay curves, allocating marketing budgets, and harvesting backlist cash flow for frontlist releases.

---

## 2. Competitive Landscape & Core Differentiation

### 2.1 Competitive Overlap Analysis

Nimphy does not operate in a vacuum. Modern publishing software contains several established point solutions and suites:

| Competitor           | Primary Capabilities                                                                                                                                            | Overlap with Nimphy Vision                                                                    | Competitor Limitations & Strategic Gaps                                                                                                                         |
| :------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BookBeam**         | Keyword research, niche tracking, category analysis, listing optimization, AI book description and outline tools. _(Source: Vendor-reported product marketing)_ | Competes directly in market research, rank tracking, and initial AI-assisted idea generation. | Does not provide deterministic financial underwriting, production capital amortization, sensitivity rankings, or actual-vs-projected P&L reconciliation.        |
| **Publisher Rocket** | Amazon keyword search volume estimation, category competition analysis, AMS keyword research. _(Source: Vendor-reported product marketing)_                     | Overlaps with category and keyword validation.                                                | Single-point desktop software focused exclusively on Amazon metadata; offers no financial modeling, manuscript creation, or portfolio intelligence.             |
| **Novelcrafter**     | Structured codex/world-building, story outline planning, AI-assisted prose drafting via external LLM APIs. _(Source: Vendor-reported product marketing)_        | Overlaps with structured book planning and AI co-pilot drafting (CREATE).                     | Fiction-centric creative tool; completely disconnected from market demand research, commercial validation, unit economics, or financial underwriting.           |
| **Sudowrite**        | Creative fiction brainstorming, AI sensory description expansion, scene drafting, character generation. _(Source: Vendor-reported product marketing)_           | Overlaps with creative drafting assistance.                                                   | Unstructured creative writing tool; treats writing as ungrounded generative prose without commercial underwriting, research provenance, or metadata production. |

### 2.2 The Central Differentiation Hypothesis

> **[Strategic Hypothesis — To Be Validated]:**
> Nimphy’s defensible differentiation does **not** derive from offering keyword research or AI-assisted writing in isolation. Existing commercial tools already provide these capabilities.
>
> Nimphy’s differentiation derives from connecting **evidence-backed publishing decisions to deterministic financial underwriting, structured human-in-the-loop book creation, and actual-versus-projected portfolio performance.**

By grounding every title in auditable unit economics before creation, maintaining evidence provenance during creation, and reconciling post-launch royalty actuals against underwritten scenarios, Nimphy transforms book publishing from speculative gambling into a disciplined investment discipline.

---

## 3. Target Customer Segments & Strategic Recommendations

### 3.1 Customer Segment Evaluation Matrix

All market size, publishing velocity, willingness to pay, and acquisition assumptions in this section are **unvalidated hypotheses** to be evaluated during customer discovery:

| Dimension                       | Segment A: Professional Independent Publishers                                                | Segment B: High-Volume Self-Publishers (Authorpreneurs)                                       | Segment C: New Independent Authors                                                        | Segment D: Small Publishing Businesses (Imprints / Small Presses)                                  |
| :------------------------------ | :-------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------- |
| **Customer Profile**            | Independent publishing businesses releasing multiple titles annually across multiple formats. | Self-publishing authors operating their publishing activity as an active commercial business. | First-time authors attempting to write, package, and release their first book.            | Small commercial or hybrid presses managing multiple authors, titles, and distribution channels.   |
| **Core Problem**                | Capital allocation across competing book proposals; managing sunk production debt.            | Idea triage; rapid evaluation of commercial viability; managing production costs.             | Navigating publishing complexity; fear of commercial failure; lack of workflow guidance.  | Multi-title acquisition evaluation; author advance recoupment; portfolio cash flow management.     |
| **Willingness to Pay (WTP)**    | _[Hypothesis — unvalidated]_: Medium to High (\$50–\$200/mo or per-dossier pricing).          | _[Hypothesis — unvalidated]_: Medium to High (\$39–\$99 per title dossier or monthly SaaS).   | _[Hypothesis — unvalidated]_: Low and highly price-sensitive; prefers free web utilities. | _[Hypothesis — unvalidated]_: High (\$100–\$500/mo institutional SaaS budget).                     |
| **Usage Frequency**             | _[Hypothesis — unvalidated]_: Monthly to quarterly during title planning and review cycles.   | _[Hypothesis — unvalidated]_: Weekly to monthly during ongoing series production.             | _[Hypothesis — unvalidated]_: One-off usage during a single book project.                 | _[Hypothesis — unvalidated]_: Monthly to quarterly aligned with editorial acquisition meetings.    |
| **Customer Acquisition**        | _[Hypothesis — unvalidated]_: Moderate; reachable via publishing associations (IBPA, ALLi).   | _[Hypothesis — unvalidated]_: Accessible via dedicated author communities and conferences.    | _[Hypothesis — unvalidated]_: Diffuse consumer market; high acquisition cost and noise.   | _[Hypothesis — unvalidated]_: Long enterprise sales cycles; requires demos and stakeholder review. |
| **Existing Alternatives**       | Custom spreadsheets, gut feel, external publishing consultants.                               | Publisher Rocket, BookBeam, custom spreadsheets, community benchmarks.                        | Free web articles, YouTube tutorials, generic AI chatbots.                                | Traditional accounting spreadsheets, enterprise title management software.                         |
| **Recurring Revenue Potential** | _[Hypothesis — unvalidated]_: High retention if tied to ongoing catalog planning.             | _[Hypothesis — unvalidated]_: High retention across recurring title releases.                 | _[Hypothesis — unvalidated]_: Very low recurring potential; high post-launch churn.       | _[Hypothesis — unvalidated]_: High contract value; low churn if embedded in operations.            |
| **Suitability for Initial MVP** | **Secondary (Cohort 2):** Strong fit for portfolio features; requires multi-format depth.     | **Primary Wedge Candidate:** Immediate alignment with single-title underwriting wedge.        | **Outside MVP Scope:** Purchasing behavior misaligned with financial underwriting wedge.  | **Future Expansion:** Requires multi-user permissions, contracts, and advanced accounting.         |

### 3.2 Strategic Customer Recommendation

1. **Proposed Primary Initial Target: Segment B (High-Volume Self-Publishers / Authorpreneurs) `[Hypothesis — Primary Initial Segment to Validate]`**
   - _Rationale:_ Authorpreneurs make recurring capital allocation decisions, invest personal funds into professional editing and packaging, and experience immediate financial loss from poor title selection. The Title Business Case (UNDERWRITE) provides a direct solution to their need for pre-production financial validation.
2. **Secondary Target: Segment A (Professional Independent Publishers) `[Hypothesis — Cohort 2]`**
   - _Rationale:_ Independent publishers benefit immediately from standardized financial underwriting across title submissions and provide an organic expansion path into multi-title catalog management.
3. **Excluded from MVP Scope: Segment C (New Independent Authors)**
   - _Scope Decision:_ First-time authors are excluded from the initial release because their purchasing behavior and product requirements center on basic author education, unconstrained creative experimentation, and low-cost exploratory drafting. These needs conflict with Nimphy's core commercial focus on financial underwriting, break-even analysis, and capital allocation.
4. **Future Expansion: Segment D (Small Publishing Businesses)**
   - _Scope Decision:_ Small presses represent an attractive long-term market but require multi-user role-based permissions, contract and advance tracking, and custom reporting that are deliberately excluded from the initial MVP.

---

## 4. Product Capability Framework & Architectural Guardrails

### 4.1 Capability Pillars Overview

```
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 NIMPHY CAPABILITY FRAMEWORK                                   │
├───────────────────────────────┬───────────────────────────────┬───────────────────────────────┤
│ 4.1 DISCOVER                  │ 4.2 VALIDATE                  │ 4.3 UNDERWRITE (MVP Wedge)    │
│ • Market Void Identification  │ • Comparable Title Comps      │ • Deterministic Unit Economics│
│ • Audience Gap Analysis       │ • Category Velocity Signals   │ • Capital Amortization & P&L  │
│ • Positioning Angle Synthesis │ • Review Sentiment Gap Mining │ • Multi-Scenario Modeling     │
│ • Concept & Angle Generation  │ • Verifiable Evidence Dossier │ • Grounded AI Narrative Memo  │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ 4.4 CREATE                    │ 4.5 PRODUCE                   │ 4.6 OPTIMIZE                  │
│ • Structural Architecture     │ • Retailer-Ready EPUB & PDF   │ • Actuals vs. Projections     │
│ • Chapter Outlines & Beats    │ • Compliant Metadata & BISAC  │ • Backlist Decay Modeling     │
│ • Research Provenance Dossier │ • High-Converting Descriptions│ • Catalog Capital Allocation  │
│ • Co-Pilot Drafting Engine    │ • Multi-Retailer Checklists   │ • Title Re-launch Diagnostics │
└───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

### 4.2 DISCOVER — Book Opportunity Discovery

- **Capabilities:** Market void detection, reader problem extraction from public sentiment, positioning angle formulation, and title/subtitle generation.
- **Architectural Guardrails:**
  - AI-generated concepts are suggestions, never represented as guaranteed market opportunities.
  - User-provided concepts and machine-generated suggestions are kept distinct.

### 4.3 VALIDATE — Market Intelligence & Opportunity Validation

- **Capabilities:** Comparable title benchmarking, category velocity signals, review sentiment analysis, and cited evidence recording.
- **Data Integrity & Compliance Guardrails:**
  - **Zero Fabricated Metrics:** No synthetic search volume numbers, ungrounded demand scores, or fabricated sales metrics.
  - **Data Provenance:** Every external datum records its retrieval timestamp, citation source, and method.
  - **Platform Policy Compliance:** Strictly respects retailer terms of service. No unauthorized scraping or credential bypass.

### 4.4 UNDERWRITE — Publishing Business Case (The MVP Wedge)

- **Status:** Initial product wedge and primary focus of Phase 1 implementation (Steps 001–033 in [17-implementation-roadmap.md](architecture/17-implementation-roadmap.md)).
- **Capabilities:** Structured input capture, deterministic unit economics, multi-format modeling, production capital amortization, break-even unit calculation, one-at-a-time (OAT) sensitivity ranking, optimistic/expected/pessimistic scenarios, and ungroundable AI narrative synthesis.
- **Seven Core Financial Invariants:**
  1. **Deterministic Core as Source of Truth (P-01):** Pure functions in `packages/calc-engine` calculate all economics with zero I/O and zero AI.
  2. **AI Quarantined from Calculations (P-01):** AI synthesizes narrative memos strictly conditioned on deterministic calculation trace JSON. AI never invents, modifies, or reconciles numbers.
  3. **Exact Rational Integer Minor Units:** All monetary values use integer minor units (e.g. cents) and explicit ISO currencies via the `Money` value object (`packages/domain/src/money/`). Floating-point arithmetic is strictly forbidden.
  4. **Explicit, Versioned Rule Packs:** Retailer formulas, printing matrices, and royalty tiers reside in immutable Rule Packs (`packages/rules`).
  5. **Strict Provenance Labeling:** The domain provenance vocabulary is strictly frozen to four classifications: `user_input`, `official_fact`, `estimate`, and `assumption`. Machine-generation or source-system origin is recorded via separate metadata attributes, never by altering the domain provenance enum.
  6. **Explicit Rounding Semantics:** Rounding rules (e.g., ceiling for break-even units) are declared explicitly in the applicable Rule Pack.
  7. **Complete Reproducibility:** Every calculation run is tied immutably to a Case Revision, Rule Pack semver, and Engine semver.

### 4.5 CREATE — Book Planning & Manuscript Creation

- **Capabilities:** Structured, research-grounded, human-in-the-loop book planning and manuscript creation: structural book blueprints, chapter architectures, learning objectives/story beats, citation binders, and section-by-section drafting assistance.
- **Guardrails:**
  - Nimphy is not a one-click autonomous book generator. The author/publisher remains in direct editorial control.
  - Factual claims in non-fiction planning must be tethered to recorded research citations.

### 4.6 PRODUCE — Publishing Preparation & Asset Assembly

- **Capabilities:** EPUB 3 and print-ready PDF formatting to industry trim specifications, BISAC/Thema category mapping, keyword string compilation, HTML description formatting, and retailer compliance pre-flight checks.
- **Guardrails:**
  - Technical validation checks adhere to published industry specifications (e.g., IDPF EPUB 3 standards). External retailers retain unilateral authority over final book listing and publication decisions.

### 4.7 OPTIMIZE — Publishing Performance & Portfolio Intelligence

- **Capabilities:** Actuals-versus-projected variance analysis, royalty statement reconciliation (via user-imported CSVs), backlist decay analysis, and catalog capital allocation modeling.
- **Guardrails:**
  - Real performance tracking requires verified user-supplied royalty data; sales or royalties are never synthesized or fabricated.

---

## 5. Strategic Product Roadmap & Repository Alignment

The long-term product vision unfolds across five strategic business phases. These are product phases, distinct from the committable technical steps in [17-implementation-roadmap.md](architecture/17-implementation-roadmap.md):

```
STRATEGIC PRODUCT PHASES VS. TECHNICAL REPOSITORY ROADMAP:

Phase 1: Title Business Case MVP (CURRENT TECHNICAL ROADMAP)
├── Focus: Single-title underwriting, deterministic calculations, AI memo,
|          PDF export, PayPal checkout
└── Technical Steps: STEP-001 through STEP-033 in docs/architecture/
     |               17-implementation-roadmap.md
     └── Active Packages: @nimphy/domain, @nimphy/calc-engine, @nimphy/rules,
                         @nimphy/ai, @nimphy/documents, @nimphy/payments,
                         @nimphy/persistence, @nimphy/web

Phase 2: Publishing Market Intelligence (FUTURE PRODUCT PHASE)
├── Focus: Comps research engine, category velocity signals,
|          verified evidence ledger
└── Candidate Technical Boundary: Candidate module (e.g., packages/market-
                                  intel) — unapproved, requires ADR

Phase 3: Book Discovery & Creation (FUTURE PRODUCT PHASE)
├── Focus: Opportunity-to-blueprint pipeline, research citation binder, human-
|          in-the-loop drafting
└── Candidate Technical Boundary: Candidate module (e.g., packages/editor) —
                                  unapproved, requires ADR

Phase 4: Publishing Production & Compliance (FUTURE PRODUCT PHASE)
├── Focus: EPUB/PDF compilation, metadata optimization, retailer pre-flight
|          checks, actuals CSV ingestion
└── Technical Evolution: Extensions to @nimphy/documents and
                         @nimphy/calc-engine

Phase 5: Publishing Portfolio Intelligence (FUTURE PRODUCT PHASE)
├── Focus: Cross-catalog P&L, backlist harvesting, capital allocation,
|          multi-user imprint management
└── Technical Evolution: Enterprise schema extensions, multi-tenant scoping
```

### 5.1 Preservation of Technical Scope for STEP-004

- **Synthetic Rule Packs Only:** STEP-004 is scoped strictly to synthetic `TEST_*` Rule Packs. It does not introduce real marketplace data or approved commercial royalty schedules.
- **No Approved KDP Rules:** Any real marketplace Rule Packs require separate source verification, legal review where applicable, and explicit owner authorization.

### 5.2 Illustrative Synthetic Underwriting Example

To illustrate the deterministic calculation engine without referencing unverified real-world marketplace rules, the following synthetic example demonstrates the calculation flow:

```
ILLUSTRATIVE SYNTHETIC CALCULATION FLOW (FOR SPECIFICATION PURPOSES ONLY):

1. Case Inputs (Immutable Case Revision):
   - List Price: $14.99 (Paperback format)
   - Page Count: 250 pages
   - Fixed Production Capital: $2,500.00 (Editing: $1,500, Cover: $700, Formatting: $300)
   - Provenance: All production costs labeled 'user_input'

2. Synthetic Rule Pack Applied: TEST_PRINT_RETAILER_A@1.0.0
   - Synthetic Print Cost Formula: $1.00 base + ($0.015 × 250 pages) = $4.75 [Synthetic Rule]
   - Synthetic Royalty Formula: (60% × $14.99) - $4.75 = $4.244 -> $4.24 net unit contribution

3. Deterministic Outputs (packages/calc-engine):
   - Net Unit Contribution: $4.24
   - Break-even Volume: ceil($2,500.00 / $4.24) = 590 units
   - Scenarios:
     * Conservative (300 units): Net Loss ($1,228.00)
     * Base (750 units): Net Profit $680.00
     * Optimistic (2,000 units): Net Profit $5,980.00
   - Sensitivity Ranking: 1. List Price, 2. Page Count, 3. Editing Cost
```

---

## 6. Categorization of Success Metrics & Evaluation Criteria

To maintain scientific integrity across product development, metrics are strictly partitioned into four categories:

### 6.1 Measured Implementation Results (Repository State Today)

- **Automated Test Suite:** 215/215 tests passing across 15 test suites in Vitest 3.0.8.
- **Test Coverage:** 100% statement coverage and 99.32% branch coverage across `@nimphy/domain`.
- **Architectural Boundary Enforcement:** 100% compliant; zero illegal imports; zero circular dependencies verified by `scripts/check-boundaries.mjs`.
- **Documentation Integrity:** All 23 architecture documents present and 88 internal markdown links validated by `scripts/check-docs.mjs`.

### 6.2 Engineering Acceptance Criteria (Deterministic Code Gates)

- **P-01 Enforcement:** Zero I/O, zero network, zero clock/randomness, and zero AI imports in `packages/calc-engine`.
- **Coverage Gates:** 100% branch coverage required for financial calculation routines.
- **Type Safety:** TypeScript strict mode with zero `any` types across all packages.
- **AI Ungrounded Number Rejection:** 100% rejection rate for AI narrative memos containing numbers not present in the calculation trace JSON.

### 6.3 Pilot Operational Targets (Aspirational Goals to Evaluate)

- **Formatting Conformance:** Achieve high validation conformance against published IDPF EPUB 3 and PDF/X-1a specifications during pre-flight checks. _(Note: Retailers such as Amazon KDP maintain unilateral discretion over book acceptance)._
- **Research Efficiency:** Aim to reduce time spent assembling comparable title benchmarks during customer pilots compared to manual spreadsheet compilation.

### 6.4 Product Business Hypotheses (Commercial Assumptions to Test)

- **Hypothesis H-1:** Independent publishers and authorpreneurs are willing to pay for structured title underwriting dossiers (\$39–\$99 per dossier).
- **Hypothesis H-2:** A structured business-case dossier provides sufficient commercial clarity to prevent unprofitable book production investments.
- **Hypothesis H-3:** Publishers have a recurring need for title underwriting across multiple book releases annually.
- **Hypothesis H-4:** Conversion from free calculation preview to paid dossier export can achieve commercially viable unit economics.

---

## 7. Future Architecture & Modular Monolith Governance

1. **Modular Monolith Preservation (ADR-001):** Nimphy will remain a modular monolith within the pnpm monorepo. No microservices, distributed queues, or standalone worker fleets will be introduced without explicit scaling triggers documented in [15-scaling-and-reliability.md](architecture/15-scaling-and-reliability.md).
2. **Candidate Module Status:** Any future packages mentioned in strategic plans (such as `packages/market-intel` or `packages/editor`) are **candidate architectural boundaries only**. They are not approved for implementation and will not be scaffolded until validated requirements, formal Architecture Decision Records (ADRs), and explicit owner authorizations are established.
3. **Living Documentation Governance:** In accordance with `AGENTS.md`, `docs/DESIGN.md` remains the sole living design document tracking implementation progress. Completed implementation history will never be rewritten.
