# Canonical Prompt Archive — STEP-004: Rule Pack Schema and Loader

This document archives the prompt instructions provided by the repository owner for the authorization and implementation of STEP-004.

---

```markdown
# NIMPHY — AUTHORIZE STEP-004: RULE PACK SCHEMA AND LOADER

The repository owner approves:

- STEP-003: Domain Primitives.
- The canonical Nimphy product strategy in `docs/product-strategy.md`.
- The strategic alignment recorded in `README.md` and `docs/DESIGN.md`.

You are now explicitly authorized to begin STEP-004.

## Objective

Implement the Rule Pack schema and loader using synthetic test data only.

## First: Read the requirements

Read:

- `AGENTS.md`
- `docs/DESIGN.md`
- `docs/product-strategy.md`
- `docs/architecture/17-implementation-roadmap.md`
- `docs/architecture/18-architecture-decision-records.md`
- ADR-006
- Relevant architecture principles and STEP-004 requirements.

Inspect the actual implementation and package boundaries before writing code.

## Implementation scope

Implement only the approved STEP-004 scope:

1. Define and validate the v1 Rule Pack schema.
2. Implement a deterministic Rule Pack loader.
3. Introduce synthetic `TEST_*` Rule Packs.
4. Calculate and expose a stable content hash.
5. Validate malformed, missing and unsupported rule data.
6. Ensure the schema and loader preserve domain boundaries.
7. Freeze the v1 schema and record the relevant architectural decision.

## Strict restrictions

- Do not introduce actual Amazon KDP royalty values.
- Do not introduce actual marketplace printing formulas.
- Do not use fabricated commercial values presented as real facts.
- Do not begin STEP-005 calculation-engine implementation.
- Do not implement database or API functionality outside STEP-004.
- Do not modify completed STEP-001, STEP-002 or STEP-003 implementation unnecessarily.
- Do not introduce dependencies without justification and approval.

All fixtures and example values must be clearly synthetic.

## Testing and acceptance

Implement unit tests, schema-validation tests, loader tests, malformed-input tests, deterministic hashing tests and boundary tests as appropriate.

Meet the precise acceptance criteria in the existing roadmap and relevant ADRs. Do not weaken existing quality gates.

## Mandatory documentation workflow

After implementation and hardening are complete:

1. Run tests and measure coverage.
2. Run full technical verification.
3. Update:
   - `prompts/step-04.md`
   - `learning/implementation/step-04-rule-pack-schema-and-loader.md`
   - `learning/interviews/step-04-rule-pack-schema-and-loader.md`
   - `learning/notes/step-04-rule-pack-schema-and-loader.md`
4. Update the single living `docs/DESIGN.md`.
5. Update relevant architecture documentation or ADRs where justified.
6. Run final verification after documentation changes.

Preserve the original implementation prompt and document actual engineering decisions.

## Final report

Provide:

- Implementation summary.
- File changes.
- Schema design.
- Synthetic Rule Pack examples.
- Loader and hash behavior.
- Tests and coverage.
- Architecture-boundary verification.
- Full repository verification.
- Remaining risks.
- Acceptance recommendation.

STOP after STEP-004.

Do not begin STEP-005 without explicit repository-owner authorization.
```
