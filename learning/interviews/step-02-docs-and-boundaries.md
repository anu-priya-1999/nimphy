# Senior Engineering Interview Preparation — STEP-002: Architecture Boundary & Documentation Tooling

This document contains deep technical interview questions, comprehensive answers, trade-off evaluations, and architectural explanations covering static analysis, module boundaries, inward-pointing dependencies, documentation validation, CI topologies, and conventional commit governance in enterprise TypeScript monorepos.

---

## 1. Architectural Boundaries & Dependency Direction

### Q1: Why must dependency arrows point strictly inward toward `domain`, and what concrete failure modes occur when this rule is violated?

**Answer:**
In Domain-Driven Design (DDD) and Clean/Hexagonal Architecture (Ports and Adapters), the `domain` represents enterprise business rules, core invariants, value objects, and domain types. It must represent the highest-level policy in the system and remain completely decoupled from volatile delivery mechanisms (HTTP, React, UI), persistence engines (PostgreSQL, Drizzle, Prisma), and external third-party integrations (PayPal, OpenAI, Stripe).

When dependency arrows point inward:
$$\text{apps/web} \longrightarrow \text{use-cases/services} \longrightarrow \text{domain} \longleftarrow \text{infrastructure/adapters}$$

If this direction is reversed or allowed to cycle:

1. **Volatile Coupling:** If `domain` imports from `persistence` or `calc-engine`, any change to a database column, schema migration, or calculation algorithm forces a re-compilation and potential regression across the entire system.
2. **Untestable Core:** Business rules cannot be tested in pure isolation without provisioning or mocking database clients, ORM models, or external SDKs.
3. **Circular Dependencies:** Mutual dependencies between packages (`domain` $\leftrightarrow$ `calc-engine` or `payments` $\leftrightarrow$ `persistence`) lead to initialization order bugs at runtime in Node.js/ESM, where modules receive uninitialized `undefined` exports due to circular module loading.
4. **Architectural Erosion:** Developers begin bypassing domain validation boundaries, performing direct database queries from UI handlers or mixing calculation arithmetic with presentation logic.

In Nimphy, Principle P-01 dictates a deterministic core. By mechanically prohibiting `@nimphy/domain` from importing any other package, the domain remains a pure, invariant-preserving foundation that depends on nothing.

---

### Q2: What is the architectural difference between a package-level dependency and an internal implementation import, and why must deep imports across packages be strictly prohibited?

**Answer:**
A package in a monorepo represents a bounded context with a declared public contract (the public API exported by `src/index.ts` and declared in `package.json` `main`/`types`/`exports`).

- **Package-Level Dependency:** Package A imports Package B via its canonical package specifier (`import { Money } from '@nimphy/domain'`). This binds Package A strictly to Package B's declared, versioned, public interface.
- **Deep Implementation Import:** Package A imports directly into Package B's internal directories (`import { Money } from '@nimphy/domain/src/internal/money.ts'` or relative path `import from '../../packages/domain/src/internal/money'`).

**Why deep imports are harmful:**

1. **Encapsulation Breach:** Internal implementation details (helpers, private types, experimental modules) are exposed, preventing the package author from refactoring internals without breaking external consumers.
2. **Bundling & Transpilation Inconsistencies:** Deep imports bypass package entry point resolution rules configured in `package.json` (`exports`, `typesVersions`, subpath mappings) and Next.js Turbopack `transpilePackages`, leading to duplicated code instances or mismatched TypeScript type definitions.
3. **Phantom Transitive Coupling:** If internal file `packages/domain/src/internal/helper.ts` changes its signature, external packages fail to compile even though the public `index.ts` contract remained stable.
4. **Tree-Shaking Failures:** Modern bundlers optimize and tree-shake based on public entrypoint graphs. Uncontrolled deep imports prevent effective dead-code elimination.

Nimphy's `@nimphy/architecture-boundaries` ESLint rule and `scripts/check-boundaries.mjs` mechanically reject any import containing path segments beyond the package root (`@nimphy/<pkg>/...`), enforcing strict public interface encapsulation.

---

## 2. Static Analysis & Custom ESLint Rule Authoring

### Q3: Compare implementing architectural boundary enforcement via a custom local ESLint flat-config rule versus adopting an external plugin like `eslint-plugin-import` or `nx/enforce-module-boundaries`.

**Answer:**
When designing boundary tooling in a modern TypeScript monorepo, engineering teams weigh lightweight custom rules against heavyweight third-party plugins.

| Evaluation Dimension        | Custom Local Flat-Config Rule (`scripts/eslint-plugin-nimphy.mjs`)                              | External Plugin (`eslint-plugin-import` / `nx`)                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **ESLint 10 Compatibility** | Native support for ESLint 9/10 flat config (`defineConfig`). Zero peer dependency conflicts.    | `eslint-plugin-import` has notorious peer-dependency lag with ESLint 9 and 10 flat configs (`^8.0.0 \|\| ^9.0.0`). |
| **Dependency Footprint**    | Zero additional npm dependencies. Pure Node.js standard library (`node:path`).                  | Installs dozens of transitive dependencies (`doctrine`, `resolve`, `pkg-dir`, `minimatch`).                        |
| **Domain-Specific Rules**   | Exactly encodes Nimphy principles (e.g. Principle P-01: zero I/O, zero AI in `calc-engine`).    | Generic rules (`no-restricted-imports`) require complex, brittle regex configurations.                             |
| **Diagnostic Clarity**      | Emits actionable domain diagnostics referencing specific architecture documents and principles. | Emits generic lint error messages ("Import is restricted").                                                        |
| **Execution Speed**         | Extremely fast: AST node inspection of `node.source.value` with direct path resolution.         | Slower: performs multi-step disk resolutions and package manifest parsing per import node.                         |
| **Maintenance Burden**      | Team maintains ~150 lines of clear, tested TypeScript/ESM code.                                 | Subject to upstream breaking changes and configuration churn.                                                      |

**Decision in Nimphy:**
Nimphy chose a custom local ESLint plugin rule paired with a standalone script (`check-boundaries.mjs`). This avoided downgrading ESLint 10, preserved zero warnings, eliminated external plugin vulnerability surface, and allowed precise enforcement of Principle P-01 and AGENTS.md rules.

---

### Q4: How does an AST visitor in ESLint handle different module import/export syntax forms, and how do you prevent false positives for type-only imports?

**Answer:**
In modern ECMAScript and TypeScript, module linking occurs through multiple syntactic constructs represented in ESTree/TypeScript AST:

1. **Static Value Imports:** `import { calculate } from '@nimphy/calc-engine';`
   - Node: `ImportDeclaration`
   - Attributes: `node.source.value`, `node.importKind === 'value'`
2. **Type-Only Declaration Imports:** `import type { Money } from '@nimphy/domain';`
   - Node: `ImportDeclaration`
   - Attributes: `node.importKind === 'type'`
3. **Specifier-Level Type Imports:** `import { type CurrencyCode, createMoney } from '@nimphy/domain';`
   - Node: `ImportDeclaration` with specifiers having `specifier.importKind === 'type'`
4. **Re-exports (Named & Wildcard):** `export { calculate } from '@nimphy/calc-engine';` and `export * from '@nimphy/domain';`
   - Nodes: `ExportNamedDeclaration`, `ExportAllDeclaration`
5. **Dynamic Imports:** `const engine = await import('@nimphy/calc-engine');`
   - Node: `ImportExpression` with `node.source`

**Handling Type-Only Imports Without False Positives:**

- **The False Positive Hazard:** Some naive linters treat `import type` as a runtime dependency and fail if runtime dependencies are restricted, OR they mistakenly ignore `import type` when enforcing strict architecture boundaries.
- **Architectural Policy:**
  - If Package A is _authorized_ to depend on Package B (e.g. `@nimphy/calc-engine` depends on `@nimphy/domain`), both runtime imports and `import type` are fully permitted.
  - If Package A is _prohibited_ from depending on Package B (e.g. `@nimphy/domain` importing `@nimphy/calc-engine`), `import type` must **still be rejected**. Even type-only imports reverse the architecture arrow, couple domain types to calculation structures, and create conceptual circularity.
- **AST Implementation:**
  The visitor intercepts `ImportDeclaration`, `ExportNamedDeclaration`, `ExportAllDeclaration`, and `ImportExpression`. It validates `node.source.value` against the canonical dependency matrix regardless of whether the AST marks the node as `importKind: 'type'`, ensuring that prohibited packages cannot leak in through type annotations.

---

## 3. Documentation as Code & Mechanical Verification

### Q5: Why is automated, mechanical documentation verification necessary in early-stage projects before application features are implemented?

**Answer:**
Documentation drift is one of the most common modes of architectural degradation in software engineering. When an architecture package contains 23 detailed specifications, dozens of ADRs, and hundreds of cross-references:

1. **Silent Link Decay:** As files are renamed, split, or refactored during initial development, relative links (`[03](03-architecture-principles.md)`) break silently unless checked on every commit.
2. **ADR Status Ambiguity:** If developers invent ad-hoc statuses (`Draft`, `Approved`, `WIP`, `In Review`) instead of canonical vocabulary (`Accepted`, `Proposed`, `Superseded`, `OPEN`), stakeholders cannot determine whether a design is an approved binding decision or an open proposal.
3. **Specification Drift:** If code evolves without automated checks verifying that referenced architecture files exist, new engineers and AI coding agents build against hallucinated or superseded assumptions.
4. **Mechanical Enforceability:** By establishing `scripts/check-docs.mjs` in Phase 0 (STEP-002), any broken link, missing document, duplicate document number, or invalid status immediately breaks CI, guaranteeing that documentation maintains the exact same standard of quality and continuous verification as production application code.

---

### Q6: How does heading anchor slugification work in GitHub Flavored Markdown, and how do you validate markdown anchors without false positives?

**Answer:**
GitHub generates anchor IDs for markdown headings using a deterministic algorithm:

1. Downcase the entire heading text.
2. Remove HTML tags (`<...>` -> ``).
3. Strip inline markdown styling (code blocks, bold markers, italic markers, link syntax).
4. Remove all punctuation and symbols except letters, digits, spaces, and hyphens (`/[^\w\s-]/g` -> ``).
5. Trim whitespace and replace whitespace sequences with a single hyphen (`/\s+/g` -> `-`).
6. Disambiguate duplicate headings within the same document by appending sequential numeric suffixes (`-1`, `-2`, `-3`).

**Preventing False Positives in Link Validation:**

- **Code Fences and Inline Code:** Code examples frequently contain illustrative markdown links, e.g. ` ```markdown [Example](target.md) ``` `. Validating these results in broken-link false positives. The validator must strip code blocks and inline code spans before extracting links.
- **HTML Comments:** Markdown documents often contain commented-out links or editorial notes. HTML comments (`<!-- ... -->`) must be stripped before link extraction.
- **External Protocols:** Links beginning with `http://`, `https://`, `mailto:`, and `ftp://` must be bypassed to avoid non-deterministic network requests during CI.
- **URL Encoding:** Anchor links and file paths may contain URI components (`%20`). The validator must run `decodeURIComponent()` before checking disk existence or matching heading slugs.

---

## 4. Continuous Integration & Commit Governance

### Q7: What is the optimal execution topology for steps in a CI pipeline, and why should documentation and boundary checks run before unit tests and builds?

**Answer:**
In continuous integration pipelines, execution order should optimize for **fail-fast feedback** and **compute efficiency**.

**Nimphy CI Order of Operations:**

1. `Install Dependencies (--frozen-lockfile)`: Ensures clean, reproducible node_modules.
2. `Prettier Format Check (pnpm format:check)`: Ultra-fast (~1s). Fails immediately on whitespace or formatting issues.
3. `TypeScript Compilation (pnpm typecheck)`: Type check across all 8 workspace projects (~3-5s).
4. `ESLint (pnpm lint)`: Lints code and runs `@nimphy/architecture-boundaries` (~3s).
5. `Documentation Validation (pnpm docs:check)`: Fast disk & link verification (~0.5s).
6. `Architecture Boundary Verification (pnpm boundaries:check)`: Manifest & cycle verification (~0.5s).
7. `Conventional Commit Check (pnpm commit:check --last)`: Validates commit message structure (~0.2s).
8. `Unit & Component Tests (pnpm test)`: Executes test suites (~15-20s).
9. `Production Application Build (pnpm build)`: Most computationally expensive step (~10-30s).

**Why Static & Boundary Checks Precede Tests and Builds:**

- **Cost Minimization:** Running static analysis, docs check, and boundary verification takes $< 5$ seconds combined. If an illegal import or broken link exists, the build fails immediately without burning 30+ seconds running headless browser tests or Next.js Turbopack compilation.
- **Root Cause Isolation:** If a package boundary is violated, unit tests might fail cryptically due to circular imports or missing mocks. Running boundary checks first pinpoints the exact architectural root cause.

---

### Q8: How does conventional commit enforcement benefit monorepo architectures, and how do you ensure git hooks operate reliably across Windows and Linux environments?

**Answer:**
Conventional Commits (`type(scope): description`) establish machine-readable git history.

**Monorepo Benefits:**

1. **Automated Semantic Versioning:** Tools can determine whether a commit requires a patch (`fix`), minor (`feat`), or major (`type!:` or `BREAKING CHANGE:`) bump per package based on the commit type and scope.
2. **Automated Changelog Generation:** Release tools can automatically generate segmented changelogs grouped by workspace package (`feat(calc-engine)`, `fix(payments)`).
3. **Traceability:** Correlates git commits directly to architectural roadmap steps and decision records (`feat(payments): implement EP-023 canonical capture`).

**Cross-Platform Git Hook Engineering:**

- **The Windows Challenge:** Windows command prompt (`cmd.exe`) and PowerShell do not natively execute POSIX shell scripts (`#!/bin/sh`) without a shell runner. However, Git for Windows includes embedded Bash (`sh.exe`).
- **Native Git Hooks Path:** By configuring `git config core.hooksPath .githooks`, git uses the repository's `.githooks/` directory directly without requiring third-party Node.js daemons like Husky.
- **Node.js Delegation:** The `.githooks/commit-msg` script is a minimal 2-line shell script that forwards `$1` (the path to `.git/COMMIT_EDITMSG`) directly to `node scripts/check-commit.mjs "$1"`.
- **Line Endings:** The hook file must use LF line endings (`.gitattributes: * text=auto eol=lf`), preventing Windows CRLF carriage-return syntax errors when executed by Git's embedded shell.
- **Fallback Verification:** In CI environments where git hooks do not fire during checkout, the verification script is executed explicitly as a CI step (`pnpm commit:check --ci`), ensuring complete enforcement across both local and remote environments.

---

### Q9: Why must Git hook configuration be strictly local (`--local`) rather than global (`--global`), and what operational mechanism guarantees fresh clones activate hooks?

**Answer:**
Configuring Git hooks through `core.hooksPath` points Git's hook runner to a custom repository directory.

**Why Global Configuration is Unacceptable:**

1. **Developer Workstation Pollution:** Modifying `--global core.hooksPath` alters Git behavior for _every_ repository on the developer's machine, overriding custom hooks in other personal or corporate projects.
2. **Security & Principle of Least Privilege:** A global hook pointing to a specific repository path could execute unexpected scripts when committing in completely unrelated repositories.
3. **Reproducibility:** Tooling must remain self-contained within the repository boundary.

**The Local Configuration Mechanism:**

- Nimphy implements `scripts/setup-hooks.mjs` exposed via `pnpm setup:hooks`.
- It executes `git config --local core.hooksPath .githooks`, setting the configuration exclusively inside the repository's `.git/config`.
- It performs pre-flight checks verifying Git availability and Git repository status, failing gracefully if run outside Git.
- It sets executable permissions (`chmod 0o755`) for `.githooks/commit-msg` on POSIX systems while safely handling non-POSIX Windows filesystems.

**Fresh Clone Operational Protocol:**
Git does not automatically copy or run hooks on clone for security reasons (to prevent malicious repositories from executing arbitrary code upon `git clone`). Therefore, every fresh clone must run:

```bash
pnpm install
pnpm setup:hooks
```

This is documented as a mandatory onboarding step in `README.md` and enforced in CI where `pnpm commit:check --ci` acts as a fail-safe backstop.

---

### Q10: How should CI validate Conventional Commits across multi-commit Pull Requests and pushes, why must merge commits be excluded, and how are edge cases like shallow checkouts and all-zero SHAs handled?

**Answer:**
Single-commit validation (`git log -1`) only inspects the head commit. In a pull request with multiple commits (e.g., 3 commits where commit 1 has an invalid header and commit 3 has a valid header), `--last` falsely reports success, allowing non-compliant commits to pollute the main branch history.

**Comprehensive Range Validation Strategy:**

1. **Pull Requests (`PR_BASE_SHA..PR_HEAD_SHA`):** Validates every commit introduced on the PR branch that is not on the base branch.
2. **Pushes (`PUSH_BEFORE_SHA..PUSH_AFTER_SHA`):** Validates commits pushed in the push event.
3. **CI Checkout Depth (`fetch-depth: 0`):** By default, GitHub Actions `actions/checkout@v4` fetches only `fetch-depth: 1` (a shallow clone containing only the tip commit). In shallow checkouts, `git log <base>..<head>` fails because earlier commits are missing. Configuring `fetch-depth: 0` ensures complete Git history is available for revision traversal.
4. **Exclusion of Merge Commits (`--no-merges`):**
   - Merge commits (e.g., `Merge branch 'main' into feat-branch` or `Merge pull request #12 from ...`) are automatically generated by Git or GitHub.
   - They do not follow Conventional Commits format and do not introduce new code changes themselves.
   - Validating merge commits would cause false-positive failures on legitimate PR merges. Using `git log --no-merges` explicitly inspects only author-written feature/fix commits.
5. **Handling All-Zero Before SHA on New Branches:**
   - When a new branch is pushed, GitHub Actions sets `github.event.before` to an all-zero SHA (`0000000000000000000000000000000000000000`).
   - Passing `0000000000000000000000000000000000000000..HEAD` to Git throws `fatal: Invalid revision range`.
   - The validator detects all-zero SHAs via `isZeroSha(from)` and safely handles the event by checking commits against `origin/main` if available or inspecting the tip commit directly.
6. **Error Reporting & Exit Code:**
   - The checker prints each invalid commit's SHA and subject line alongside the specific Conventional Commit failure reasons.
   - It returns a non-zero exit code if any commit in the range fails, failing the CI step and blocking merge.
