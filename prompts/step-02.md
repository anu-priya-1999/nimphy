# Canonical Prompt Archive — STEP-002: Documentation and Architecture Boundary Tooling

This document archives the prompt instructions provided by the user for the implementation of STEP-002.

---

```markdown
# NIMPHY — STEP-002: DOCUMENTATION AND ARCHITECTURE BOUNDARY TOOLING

You are the Principal Engineer responsible for implementing Nimphy.

STEP-001 — Project Scaffolding is complete.

Your task is to implement STEP-002 exclusively, following:

`docs/architecture/17-implementation-roadmap.md`

The architecture documents, AGENTS.md and STEP-001 implementation records are the authoritative context.

Do not start STEP-003.

# 1. PRE-FLIGHT INSPECTION

Read:

- `AGENTS.md`
- `docs/DESIGN.md`
- `docs/architecture/03-architecture-principles.md`
- `docs/architecture/04-system-architecture.md`
- `docs/architecture/05-component-responsibilities.md`
- `docs/architecture/17-implementation-roadmap.md`
- `docs/architecture/18-architecture-decision-records.md`
- `docs/architecture/22-definition-of-done.md`
- `learning/implementation/step-01-project-scaffolding.md`
- `learning/notes/step-01-project-scaffolding.md`

Inspect:

- `package.json`
- `eslint.config.mjs`
- `pnpm-workspace.yaml`
- All seven workspace package manifests.
- Existing tests.
- `.github/workflows/ci.yml`
- Existing scripts.
- Git configuration.

Confirm the exact STEP-002 objective, scope, dependencies, expected files and acceptance criteria in the roadmap.

If this prompt conflicts with the canonical roadmap, the roadmap takes precedence. Report material discrepancies before proceeding.

# 2. DOCUMENTATION VALIDATION TOOLING

Create a mechanical documentation validation script.

Suggested location:

`scripts/check-docs.mjs`

Expose it through:

`pnpm docs:check`

The checker must validate:

## A. Architecture document inventory

Verify that exactly the required 23 numbered architecture documents exist:

- `00-README.md`
- Through `22-definition-of-done.md`

Detect missing files and unexpected duplicate numbering.

Do not delete or rewrite architecture documents.

## B. Markdown links

Validate internal repository links.

Check:

- Relative Markdown links.
- Relative links containing anchors.
- Links to local documents.
- Links to local directories where applicable.

Resolve paths relative to the containing Markdown file.

Handle URL-encoded paths.

Ignore external HTTP(S) links and fragment-only links unless the architecture explicitly requires fragment validation.

Do not incorrectly report code examples, fenced Markdown, or external URLs as broken local links.

Provide useful error messages containing the source document and broken target.

## C. Documentation status vocabulary

Inspect the canonical architecture documentation and ADR conventions.

Establish a single explicit vocabulary based on the existing architecture.

Validate recognized status fields without rejecting ordinary prose that happens to contain similar words.

At minimum, ensure ADR statuses follow the documented conventions.

Do not invent new status terminology without updating the canonical documentation and documenting the decision.

## D. Exit behavior

The script must:

- Return exit code 0 when checks pass.
- Return nonzero when validation fails.
- Print a readable summary.
- Identify every detected problem.
- Work on Windows PowerShell and Linux CI.
- Avoid unnecessary external network access.

Create unit tests for the validation logic.

Use Node's built-in testing facilities or the existing Vitest infrastructure, according to the repository's established conventions.

# 3. ARCHITECTURE DEPENDENCY BOUNDARIES

Implement automated enforcement for Nimphy's dependency rules.

The canonical rules are documented in:

`AGENTS.md`

and:

`docs/architecture/03-architecture-principles.md`

The current intended boundaries include:

1. `packages/domain` imports no other Nimphy workspace package.
2. `packages/calc-engine` may import `packages/domain` only.
3. `packages/rules` may depend on `packages/domain`.
4. `packages/ai` may depend on `packages/domain`.
5. `packages/documents` may depend on `packages/domain`.
6. `packages/payments` may depend on `packages/domain`.
7. `packages/persistence` may depend on `packages/domain`.
8. `apps/web` is the application boundary and may compose approved modules.
9. No package should bypass another package's public interface by importing its internal source paths.
10. Dependencies must not create cycles or reverse inward-pointing domain dependencies.

Before implementing rules, inspect the actual package manifests and source files.

Do not enforce a stricter relationship than the canonical architecture authorizes.

## Implementation requirements

Preserve the current ESLint 10 configuration.

Do not downgrade ESLint.

Do not introduce an incompatible third-party plugin.

Evaluate whether a small local ESLint flat-config plugin is sufficient.

If implementing a custom rule:

- Give it a descriptive name.
- Validate relative imports and package imports.
- Resolve workspace aliases correctly.
- Detect prohibited cross-package imports.
- Detect imports that bypass package public entry points.
- Handle static imports and re-exports.
- Avoid false positives for type-only imports.
- Provide actionable diagnostics.
- Include positive and negative test cases.

Prefer a small maintainable implementation over a complex dependency framework.

Expose the relevant verification command through the existing scripts.

# 4. CONVENTIONAL COMMIT VALIDATION

Inspect the roadmap and existing repository configuration.

Implement a conventional commit-message validation mechanism.

The convention should be explicit and documented.

Use an accepted format such as:

`type(scope): description`

Possible types:

- feat
- fix
- docs
- refactor
- test
- build
- ci
- chore
- perf
- revert

Examples:

- `feat(calc-engine): add break-even calculation`
- `fix(payments): prevent duplicate capture`
- `docs(architecture): clarify case deletion`
- `test(domain): add money value tests`

Implement a cross-platform validation script.

If Git hooks are established in this step, ensure they work on the Windows development environment and GitHub Actions.

Do not introduce a heavyweight hook framework unnecessarily.

Document the setup and how a developer verifies a commit message.

Do not rewrite existing Git history.

# 5. PACKAGE SCRIPTS

Add clear root scripts, following existing naming conventions.

Expected capabilities include:

- `pnpm docs:check`
- `pnpm boundaries:check`
- A commit-message validation command.
- A combined architecture verification command where useful.

Do not break existing commands:

- `pnpm dev`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format`
- `pnpm format:check`
- `pnpm test`
- `pnpm build`

Keep scripts cross-platform.

# 6. CI INTEGRATION

Update:

`.github/workflows/ci.yml`

Integrate the new documentation and boundary checks.

CI should execute:

1. Frozen-lockfile installation.
2. Formatting validation.
3. TypeScript typechecking.
4. ESLint.
5. Documentation validation.
6. Architecture dependency-boundary verification.
7. Unit tests.
8. Production build.

Add conventional commit validation to the appropriate pull-request or commit-validation workflow if supported by the roadmap.

Preserve the existing CI setup and action versions unless a justified correction is required.

Do not claim remote GitHub Actions passed unless it has actually executed.

# 7. SCOPE RESTRICTIONS

This step is specifically about documentation automation and architecture enforcement.

DO NOT implement:

- Domain primitives.
- Money or currency types.
- Financial calculations.
- Royalty rules.
- Database schema.
- Database clients.
- Authentication.
- Case creation.
- AI provider integration.
- Payment processing.
- PDF generation.
- Background jobs.

These belong to future roadmap steps.

Do not implement STEP-003.

# 8. TESTING AND VERIFICATION

Add meaningful tests for:

- Correct architecture inventory.
- Missing architecture documents.
- Valid relative links.
- Invalid relative links.
- Anchor handling.
- External URL handling.
- Valid and invalid document status values.
- Valid architecture imports.
- Prohibited package imports.
- Import boundary bypass attempts.
- Valid conventional commit messages.
- Invalid conventional commit messages.

Run:

`pnpm install --frozen-lockfile`

`pnpm typecheck`

`pnpm lint`

`pnpm format:check`

`pnpm docs:check`

`pnpm boundaries:check`

`pnpm test`

`pnpm build`

All checks must pass before STEP-002 can be marked complete.

If a check fails, investigate and fix it within STEP-002.

Never weaken rules simply to make verification pass.

# 9. FOUR STEP-SPECIFIC DOCUMENTS

Create or update exactly these four step records:

1. `prompts/step-02.md`
2. `learning/implementation/step-02-docs-and-boundaries.md`
3. `learning/interviews/step-02-docs-and-boundaries.md`
4. `learning/notes/step-02-docs-and-boundaries.md`

The implementation record must explain the actual tooling, architecture checks, tests and technical decisions.

The interview document must contain detailed engineering interview questions about static analysis, module boundaries, dependency direction, documentation validation, CI and commit conventions.

The notes document must contain technical discoveries, troubleshooting history, design trade-offs and lessons.

The prompt archive must preserve the instructions used for STEP-002. Do not describe a reconstructed prompt as an exact transcript.

# 10. UPDATE THE SINGLE DESIGN DOCUMENT

Update the existing:

`docs/DESIGN.md`

Do not create another DESIGN file.

Record:

- STEP-001 completion.
- STEP-002 implementation status.
- New scripts and tooling.
- Dependency-boundary rules.
- Documentation validation capabilities.
- Commit conventions.
- Tests and actual results.
- Changes to CI.
- Open issues.
- Next authorized roadmap step.

Only mark STEP-002 Complete when its actual acceptance criteria and applicable verification checks pass.

# 11. FINAL VALIDATION

Before finishing:

- Confirm all 23 architecture documents remain present.
- Verify documentation links.
- Verify dependency-boundary rules.
- Verify all new tests.
- Verify all package scripts.
- Confirm no STEP-003 functionality was introduced.
- Run `git diff --check`.
- Run formatting and linting again.
- Confirm no credentials or secrets were added.
- Confirm all four step-specific records exist.
- Check that DESIGN.md remains the only living design document.

# 12. FINAL REPORT

Report:

1. Files created and modified.
2. Documentation checker design.
3. Dependency-boundary enforcement design.
4. Conventional commit validation.
5. CI changes.
6. Test coverage and actual test results.
7. Commands executed.
8. All open issues.
9. Deviations from the architecture, if any.
10. STEP-002 completion status.
11. Next authorized step.

Do not claim completion with failing checks.

Do not start STEP-003.

STOP after STEP-002 and wait for owner review.
```
