# Technical Notes & Engineering Reference — STEP-002: Documentation and Architecture Boundary Tooling

This document provides technical reference notes, discoveries, design trade-offs, troubleshooting records, and engineering lessons learned during the implementation of **STEP-002**.

---

## 1. Technical Discoveries

### A. ESLint 10 Flat Config Local Plugins

In ESLint 9 and 10 flat configuration (`eslint.config.mjs`), plugins no longer need to be published packages on npm or hoisted into `node_modules`. An ESLint plugin in flat config is simply a JavaScript object adhering to the plugin interface:

```javascript
export const nimphyPlugin = {
  meta: {
    name: 'eslint-plugin-nimphy',
    version: '0.1.0',
  },
  rules: {
    'architecture-boundaries': architectureBoundariesRule,
  },
};
```

This object can be directly imported and registered under any arbitrary namespace in `eslint.config.mjs`:

```javascript
export default defineConfig([
  ...{
    plugins: {
      '@nimphy': nimphyPlugin,
    },
    rules: {
      '@nimphy/architecture-boundaries': 'error',
    },
  },
]);
```

**Key Benefit:** Completely circumvents the peer-dependency conflicts that plague third-party plugins like `eslint-plugin-import` when migrating to ESLint 10, while providing first-class IDE and linter integration.

---

### B. Cross-Platform File Path Normalization (Windows vs Linux)

On Windows environments, file paths reported by `context.filename` or `path.resolve()` use backslashes (`\`), whereas package imports, ESM module specifiers, and POSIX environments use forward slashes (`/`).

- Any path comparison or regex matching must normalize backslashes immediately:
  ```javascript
  const normalized = filePath.replace(/\\/g, '/');
  ```
- Path matching against workspace roots (`/packages/domain/`) must account for whether the path is absolute (`C:/repo/packages/domain/...`) or relative (`packages/domain/...`). Prepending a leading slash if absent (`normalized.startsWith('/') ? normalized : `/${normalized}``) guarantees consistent substring matching across all OS platforms.

---

### C. GitHub Markdown Heading Slugification Mechanics

When GitHub renders markdown headings into HTML anchor IDs:

1. Punctuation characters (such as parentheses, commas, periods, ampersands, and em-dashes `—`) are removed.
2. Contiguous whitespace resulting from removed characters collapses into a single hyphen (`-`).
3. For example:
   - Heading: `## ADR-001 Modular monolith — Proposed`
   - Stripping `—`: `adr-001 modular monolith   proposed` (three spaces)
   - Collapsing whitespace: `adr-001-modular-monolith-proposed` (single hyphen)
4. Duplicate headings within the same document receive numerical suffixes (`-1`, `-2`).

Our documentation validation tool (`scripts/check-docs.mjs`) accurately reproduces this slugification, enabling zero false-positive anchor validation across all 23 architecture documents.

---

## 2. Troubleshooting History

During implementation and test execution, four specific issues arose and were resolved:

### Issue 1: Relative Path Package Resolution

- **Symptom:** In `tests/boundaries.test.ts`, `getPackageForFilePath('packages/rules/src/index.ts')` returned `null` instead of `'@nimphy/rules'`.
- **Root Cause:** `getPackageForFilePath` checked `normalized.includes('/packages/rules/')`. When passed a relative path lacking a leading slash (`packages/rules/...`), the check failed.
- **Resolution:** Added a prefix normalization step:
  ```javascript
  const withLeading = normalized.startsWith('/') ? normalized : `/${normalized}`;
  ```
  Both relative and absolute paths now match reliably.

### Issue 2: Commit Header Empty Description Parsing

- **Symptom:** In `tests/check-commit.test.ts`, `validateCommitMessage('feat(calc-engine):   ')` failed with generic format error instead of "Commit description must not be empty".
- **Root Cause:** `lines[0].trim()` stripped trailing whitespace from the header line, reducing it to `'feat(calc-engine):'`. The header regex required `:\s+(.+)`, which failed to match when no characters followed the colon.
- **Resolution:** Added an explicit pre-check regex:
  ```javascript
  const emptyDescRegex = /^([a-zA-Z0-9_-]+)(?:\(([a-zA-Z0-9_\-\/]+)\))?(!)?:\s*$/;
  if (emptyDescRegex.test(header)) {
    errors.push('Commit description must not be empty.');
  }
  ```
  This immediately detects empty descriptions with precision.

### Issue 3: Punctuation Slugification in Test Expectation

- **Symptom:** In `tests/check-docs.test.ts`, `slugifyHeading('Principles & Constraints (Core)')` returned `'principles-constraints-core'`, but the test expected `'principles--constraints-core'`.
- **Root Cause:** The test author assumed the ampersand `&` left a double hyphen. In GitHub markdown, punctuation is stripped and contiguous spaces are collapsed into a single hyphen.
- **Resolution:** Corrected the test assertion to `'principles-constraints-core'`, reflecting actual GitHub anchor behavior.

### Issue 4: ESLint Unused Variable Warnings in Test Files

- **Symptom:** `pnpm lint` reported two `@typescript-eslint/no-unused-vars` warnings in test files:
  - `tests/boundaries.test.ts`: `WORKSPACE_PACKAGES` imported but unused.
  - `tests/check-docs.test.ts`: `stripCodeAndComments` imported but unused.
- **Resolution:** Removed the unused imports, restoring 100% compliance with Nimphy's **Zero Warnings Policy** (0 errors, 0 warnings).

### Issue 5: Unconfigured Local Git Hooks on Fresh Clones

- **Symptom:** `.githooks/commit-msg` existed in the repository, but running `git config --local --get core.hooksPath` returned an empty string. Commits created locally were not being checked by the hook.
- **Root Cause:** Git does not automatically activate custom hook paths upon repository cloning for security reasons.
- **Resolution:** Created `scripts/setup-hooks.mjs` exposed through `pnpm setup:hooks`. It sets `git config --local core.hooksPath .githooks` locally, verifies the setting, and ensures executable permissions on POSIX systems while defending against non-Git environments. Added fresh-clone instructions to `README.md`.

### Issue 6: Single-Commit `--last` Check Missing Earlier Commits in Pull Requests

- **Symptom:** CI running `pnpm commit:check --last` checked only the tip commit of a push or pull request, failing to detect invalid Conventional Commit headers in earlier commits within the PR.
- **Resolution:** Upgraded `scripts/check-commit.mjs` to support commit ranges (`--range`, `--from ... --to ...`, `--ci`). In GitHub Actions, it checks all non-merge commits between the PR base SHA and head SHA (or push before SHA and after SHA). It detects all-zero before SHAs on new branch pushes, excludes merge commits via `--no-merges`, and configures checkout with `fetch-depth: 0`.

---

## 3. Design Trade-Offs

### 1. Dual Boundary Enforcement: ESLint Rule vs Standalone Script

- **Trade-off:** We implemented boundary enforcement both as an ESLint rule (`scripts/eslint-plugin-nimphy.mjs`) and as a standalone CLI script (`scripts/check-boundaries.mjs`).
- **Rationale:**
  - The ESLint rule provides instant developer feedback in VS Code / IDE and during `pnpm lint`.
  - The standalone script performs package manifest analysis (`package.json` dependencies vs architectural rules) and whole-graph cycle detection (DFS algorithm), which an isolated file-by-file ESLint rule cannot easily execute.
  - Running both guarantees both developer convenience and comprehensive monorepo architectural safety.

### 2. Native Git Hooks (`core.hooksPath`) vs Third-Party Frameworks

- **Trade-off:** Used Git's native `core.hooksPath .githooks` configured via `pnpm setup:hooks` instead of installing `husky` or `lint-staged`.
- **Rationale:**
  - Zero external dependencies.
  - No daemon processes or package installation scripts.
  - Standard cross-platform behavior: Windows Git Bash and Linux CI both execute shell scripts in `.githooks/` natively.
  - Strictly avoids modifying `--global` Git configuration.

### 3. Read-Only Docs Checker vs Auto-Fixing

- **Trade-off:** `scripts/check-docs.mjs` is strictly read-only and never rewrites or mutates architecture documents.
- **Rationale:**
  - Architecture specifications are canonical authoritative artifacts. An automated script should never silently modify links, headings, or statuses.
  - If a link or status is invalid, a human or agent must consciously review and correct it according to the source-of-truth hierarchy (AGENTS.md §3).

### 4. Exclusion of Merge Commits in CI Range Validation

- **Trade-off:** Used `git log --no-merges` during commit range validation.
- **Rationale:**
  - Merge commits are automatically generated by Git or GitHub (e.g. `Merge branch 'main' into ...`).
  - Merge commit messages do not follow Conventional Commits formatting and do not introduce code changes independently.
  - Validating merge commits would cause false-positive CI failures on standard pull request synchronizations.

---

## 4. Operational Commands Added in STEP-002

| Command                 | Purpose                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `pnpm setup:hooks`      | Configures local repository `core.hooksPath` to `.githooks` cross-platform             |
| `pnpm docs:check`       | Validates 23 architecture documents, markdown links, anchors, and ADR statuses         |
| `pnpm boundaries:check` | Validates package manifests, import boundaries, entry point bypasses, and cycles       |
| `pnpm commit:check`     | Validates conventional commit message from CLI argument, file, range, or latest commit |
| `pnpm arch:check`       | Executes both `docs:check` and `boundaries:check` sequentially                         |
