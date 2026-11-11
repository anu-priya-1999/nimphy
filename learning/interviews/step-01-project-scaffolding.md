# Technical Interview Preparation — STEP-001: Project Scaffolding

This document provides senior-level engineering interview preparation covering the architectural decisions, toolchain mechanics, dependency governance, and debugging lessons established in **STEP-001 (Project Scaffolding)** of Nimphy.

Each entry is structured with:

- **Interview-Ready Answer:** Concise, articulate summary suitable for verbal delivery in an interview.
- **Deep Technical Explanation:** Architectural and runtime mechanics under the hood.
- **Trade-offs & Alternatives:** Pragmatic evaluation of competing approaches.
- **Likely Follow-up Question:** Probing follow-up questions interviewers typically ask.
- **Nimphy-Specific Practical Example:** Concrete tie-in to the Nimphy repository and architecture rules.

---

### 1. Why choose a modular monolith over microservices?

#### Interview-Ready Answer

We chose a modular monolith (ADR-001) because Nimphy is in its early lifecycle, where organizational and operational simplicity is paramount. A modular monolith provides the strong logical separation of concerns and clean module boundaries of microservices without the heavy tax of distributed systems: network latency, serialisation overhead, distributed transactions, partial failures, and complex multi-repo deployments. By deploying a single artifact composed of strictly isolated workspace packages, we preserve maximum refactoring velocity while maintaining architectural discipline.

#### Deep Technical Explanation

Microservices solve organizational scaling bottlenecks when hundreds of engineers deploy independently. However, at early stages, they introduce significant distributed systems complexities:

- **Consistency Models:** Cross-service transactional consistency requires two-phase commits or saga patterns with compensating transactions.
- **Network Boundaries:** Every out-of-process RPC call introduces serialization/deserialization CPU costs, network jitter, timeout management, circuit breakers, and connection pooling.
- **Deployment Overhead:** Orchestration tools (Kubernetes, service meshes, distributed tracing) increase operational surface area.

In contrast, a modular monolith relies on in-process boundaries enforced by compile-time module loaders and static linting rules. Internal package calls are zero-latency function invocations passing typed memory references. Database interactions occur within a single database instance supporting ACID transactions.

#### Trade-offs & Alternatives

- _Trade-off:_ The boundaries are logical rather than physical. If engineers bypass import rules, the architecture degrades into a "spaghetti monolith." This must be mitigated with mechanical boundary enforcement tools (such as `eslint-plugin-import` / boundary rules scheduled for STEP-002).
- _Alternative:_ Microservices or serverless functions (e.g., AWS Lambda per route). Rejected due to deployment friction, cold start latency, and complex local testing workflows.

#### Likely Follow-up Question

_How do you prevent a modular monolith from becoming an unmaintainable distributed ball of mud over time?_

#### Nimphy-Specific Practical Example

In Nimphy, `apps/web`, `packages/calc-engine`, `packages/rules`, and `packages/persistence` live in a single repository. When a user requests a calculation, `apps/web` calls `@nimphy/calc-engine` directly in-process via TypeScript function calls. No HTTP or gRPC overhead occurs. However, `AGENTS.md` strictly forbids `packages/calc-engine` from importing `packages/persistence` or React, guaranteeing that financial math remains pure and unpolluted by database or presentation concerns.

---

### 2. Why use pnpm workspaces?

#### Interview-Ready Answer

We selected pnpm workspaces over npm or Yarn because pnpm solves the two biggest challenges of monorepo dependency management: phantom dependencies and disk duplication. pnpm uses a content-addressable global store linked via hard links and symlinks, ensuring that packages only have access to dependencies explicitly declared in their own `package.json`. This strictness prevents subtle production bugs caused by accidental transitive leakage.

#### Deep Technical Explanation

Traditional npm and Yarn v1 flatten the `node_modules` directory ("hoisting"). If package `A` depends on `B`, and `B` depends on `C`, `C` is often hoisted to the top-level `node_modules`. Developers in package `A` can import `C` without declaring it in `A`'s manifest (a phantom dependency). If `B` later updates and drops `C`, `A` breaks at runtime.

pnpm prevents this by creating a non-flat, symlinked structure. Inside each package's `node_modules`, pnpm creates symlinks only to the packages explicitly declared in that package's manifest. The actual package files reside in `.pnpm/<name>@<version>/node_modules/<name>`, which are hard-linked to a global content-addressable store. Furthermore, the `workspace:*` protocol allows sibling packages to reference the exact local development versions without manual publishing or version bumping.

#### Trade-offs & Alternatives

- _Trade-off:_ Some legacy build tools and test runners that make naive assumptions about flat directory hierarchies can fail to resolve symlinks or nested dependencies. (This directly triggered our JSX runtime issue in STEP-001).
- _Alternative:_ npm workspaces or Yarn Berry with PnP. npm workspaces still suffer from hoisting and phantom dependencies; Yarn PnP completely removes `node_modules` in favor of zip archives, which causes severe compatibility friction with Next.js Turbopack and native binaries.

#### Likely Follow-up Question

_What happens when two workspace packages declare different semver versions of the same external library?_

#### Nimphy-Specific Practical Example

In Nimphy's root `pnpm-workspace.yaml`, we define:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

When `apps/web/package.json` declares `"@nimphy/calc-engine": "workspace:*"`, pnpm creates a symlink from `apps/web/node_modules/@nimphy/calc-engine` directly to `packages/calc-engine`, enabling instantaneous TypeScript type propagation across packages during development without intermediate build steps.

---

### 3. Why use strict TypeScript?

#### Interview-Ready Answer

Strict TypeScript is non-negotiable for Nimphy because our core product value is accurate, deterministic financial calculation. Financial estimation and royalty analysis cannot tolerate runtime type coercion, missing property access, or unexpected `undefined` values. By enabling `"strict": true` along with explicit flags like `"noUncheckedIndexedAccess": true`, we eliminate entire classes of runtime errors at compile time and force developers to handle every edge case explicitly.

#### Deep Technical Explanation

Enabling `"strict": true` activates a family of compiler flags:

- `strictNullChecks`: Disallows assigning `null` or `undefined` to types unless explicitly declared as a union (e.g., `string | null`).
- `noImplicitAny`: Prevents the compiler from falling back to `any` when type inference fails, eliminating silent type safety degradation.
- `strictPropertyInitialization`: Ensures class properties are initialized in the constructor.
- `strictFunctionTypes`: Enforces contravariant parameter types and covariant return types.

In addition to `"strict": true`, Nimphy enables `"noUncheckedIndexedAccess": true` in `tsconfig.base.json`. In standard TypeScript, accessing `array[0]` returns `T`. With unchecked indexed access enabled, it returns `T | undefined`, forcing the developer to explicitly guard against out-of-bounds array access.

#### Trade-offs & Alternatives

- _Trade-off:_ Slower initial development speed and more verbose code. Developers must write explicit type guards, null checks, and assertions.
- _Alternative:_ Loose or default TypeScript. Rejected because runtime exceptions in financial applications erode customer trust and cause direct financial inaccuracies.

#### Likely Follow-up Question

_How does TypeScript's structural type system fall short in domain modeling, and how do you address it?_

#### Nimphy-Specific Practical Example

In Nimphy, monetary values must never be confused with simple integers (e.g., mixing quantity of books with cents). In STEP-003, we introduce branded types:

```typescript
type Money = number & { readonly __brand: unique symbol };
```

With strict mode active, passing a raw `number` into a function expecting `Money` fails compilation, preventing accidental addition of units to currency.

---

### 4. Why Next.js App Router?

#### Interview-Ready Answer

We chose Next.js 16 with the App Router because it natively integrates React Server Components (RSC), streaming server-side rendering, and co-located route handlers within a modern architecture. For Nimphy, RSC allows us to render data-heavy calculation summaries and server-side templates without shipping megabytes of client-side JavaScript to the browser, significantly improving page load performance and security.

#### Deep Technical Explanation

The Next.js App Router differs fundamentally from the legacy Pages Router:

- **Server Components by Default:** Components inside `app/` execute exclusively on the server unless explicitly annotated with `'use client'`. Server-side data access, markdown rendering, and secrets never leak to the client bundle.
- **Streaming & Suspense:** Fast TTFB (Time to First Byte) using HTTP chunked transfer encoding, allowing partial UI hydration as promises resolve.
- **Colocation:** Tests (`page.test.tsx`), styles (`globals.css`), and layouts (`layout.tsx`) live together in route directories rather than being scattered across disparate top-level folders.
- **Turbopack:** Built-in Rust-based bundler providing sub-second incremental builds and fast compilation times compared to Webpack.

#### Trade-offs & Alternatives

- _Trade-off:_ The mental model requires understanding the server/client boundary. Passing non-serializable objects (functions, classes) from Server Components to Client Components throws errors.
- _Alternative:_ Remix / React Router v7 or a Vite SPA. Remix is excellent for standard web apps, but Next.js offers superior ecosystem maturity, commercial deployment targets (Vercel, AWS standalone), and built-in image/font optimization.

#### Likely Follow-up Question

_When should a component in Nimphy be marked with `'use client'`?_

#### Nimphy-Specific Practical Example

In STEP-001, `apps/web/app/page.tsx` is a pure React Server Component. It renders the disclaimer banner, product explanation, and feature cards into static HTML at build time (`○ /` static prerender). Zero client-side JavaScript is executed to display this content. In future steps, only interactive input widgets (such as slider controls or dynamic currency inputs) will use `'use client'`.

---

### 5. How do workspace package dependencies work?

#### Interview-Ready Answer

Workspace package dependencies allow local packages within a monorepo to declare dependencies on sibling packages using the `workspace:*` semver protocol. The package manager resolves these dependencies by creating symbolic links in `node_modules` pointing directly to the source directory of the sibling package, rather than downloading published versions from a remote registry.

#### Deep Technical Explanation

When `pnpm install` runs in a workspace configured via `pnpm-workspace.yaml`:

1. pnpm scans all matched directories (`apps/*`, `packages/*`) and parses their `package.json` manifests.
2. It builds an internal topological dependency graph of the workspaces.
3. For any dependency matching `"@nimphy/pkg": "workspace:*"`, pnpm resolves the dependency locally.
4. During linking, pnpm creates a directory symlink:
   `apps/web/node_modules/@nimphy/calc-engine` → `packages/calc-engine`.
5. When building or publishing, pnpm automatically substitutes `workspace:*` with the actual semver version specified in the target package's manifest (e.g., `^0.1.0`).

#### Trade-offs & Alternatives

- _Trade-off:_ Requires monorepo tooling awareness. In TypeScript, path aliases (`paths` in `tsconfig.json`) or package export maps (`exports` in `package.json`) must be aligned so that editors and test runners can resolve types without requiring a build step first.
- _Alternative:_ Publishing internal packages to a private npm registry (e.g., Artifactory, GitHub Packages). Highly inefficient for fast-moving early-stage development due to version-bumping lag.

#### Likely Follow-up Question

_How does Next.js handle importing uncompiled TypeScript files from sibling workspace packages?_

#### Nimphy-Specific Practical Example

In `apps/web/next.config.mjs`, we configure:

```javascript
transpilePackages: [
  '@nimphy/ai',
  '@nimphy/calc-engine',
  '@nimphy/documents',
  '@nimphy/domain',
  '@nimphy/payments',
  '@nimphy/persistence',
  '@nimphy/rules',
];
```

This instructs Next.js Turbopack to compile the raw TypeScript source files in `packages/*/src/index.ts` directly when building the web application, avoiding the need for individual `tsc --watch` build processes during local development.

---

### 6. What are dependency boundaries?

#### Interview-Ready Answer

Dependency boundaries are architectural rules that dictate which modules or layers are allowed to import from which other modules. In clean architecture and domain-driven design, dependencies must always point inward toward high-level business rules and domain entities, never outward toward low-level details like databases, UI frameworks, or third-party SDKs. This ensures business rules remain decoupled and easily testable.

#### Deep Technical Explanation

In software systems, dependency direction governs ripple effects. If Module A depends on Module B:

- Changes in Module B's interface force changes in Module A.
- Module A cannot be tested without either importing Module B or mocking it.

To keep the core business logic stable, we invert dependencies:

- High-level modules define interfaces (ports).
- Low-level modules (adapters) implement those interfaces.
- The dependency arrows point strictly inward.

In a monorepo without boundaries, any file can import any other file, leading to circular dependencies, tight coupling, and untestable code.

#### Trade-offs & Alternatives

- _Trade-off:_ Enforcing boundaries requires defining interfaces, adapters, and data transfer objects (DTOs), which increases initial boilerplate.
- _Alternative:_ Unrestricted imports. Fast initially, but inevitably leads to architectural collapse where changing a database column breaks a UI component or calculation.

#### Likely Follow-up Question

_How do you mechanically enforce that an engineer does not violate a dependency boundary in a pull request?_

#### Nimphy-Specific Practical Example

Nimphy's `AGENTS.md` mandates the exact dependency topology:

```
apps/web ───────► packages/*
packages/* ─────► packages/domain
packages/domain ─► NONE (depends on nothing)
```

If a developer in `packages/calc-engine` attempts to import from `packages/persistence` or `@google/genai`, that violates the boundary. In STEP-002, we will introduce ESLint boundary rules that automatically fail CI on any such import.

---

### 7. Why use a pure domain package?

#### Interview-Ready Answer

A pure domain package houses the essential business vocabulary, entity definitions, value objects, and business rules without any dependency on external libraries, frameworks, or databases. By keeping `packages/domain` completely pure, our core business logic becomes timeless, indestructible, and 100% portable. It can be executed on a server, in a browser, in an edge worker, or inside a CLI tool with zero compatibility issues.

#### Deep Technical Explanation

When a domain model is polluted with framework or ORM decorators (e.g., TypeORM, Prisma, or React hooks):

- The domain becomes coupled to a specific runtime or library lifecycle.
- Unit testing requires spinning up mock databases or container environments.
- Breaking changes in third-party libraries force structural refactors of core business logic.

A pure domain package consists solely of vanilla TypeScript types, interfaces, pure validation functions, and custom domain errors. It has no dependencies listed under `dependencies` in its `package.json`.

#### Trade-offs & Alternatives

- _Trade-off:_ Requires mapping between database models (persistence layer) and domain entities, introducing an explicit transformation step (repositories / mappers).
- _Alternative:_ "Active Record" or shared ORM models where database entities serve as domain models. Rejected because database constraints (e.g., relational nullability, foreign keys) rarely map 1:1 onto rich domain invariants.

#### Likely Follow-up Question

_Can `packages/domain` import external utility libraries like lodash, date-fns, or zod?_

#### Nimphy-Specific Practical Example

In Nimphy, `packages/domain/package.json` contains:

```json
{
  "name": "@nimphy/domain",
  "dependencies": {}
}
```

`packages/domain` has zero runtime dependencies. It defines what a `BusinessCase`, `AuthorRoyaltyRule`, and `EvidenceProvenance` are. Both `packages/calc-engine` and `packages/persistence` import these types, but `domain` knows nothing about SQL, HTTP, or Next.js.

---

### 8. Why separate financial calculation logic from infrastructure?

#### Interview-Ready Answer

Separating financial calculation logic from infrastructure (Principle P-01: Deterministic Core) guarantees that financial calculations are pure mathematical functions with zero side effects. This makes our calculations 100% deterministic, effortlessly testable, reproducible, and immune to network partitions, database timeouts, or third-party service outages.

#### Deep Technical Explanation

A pure function has two defining properties:

1. Given the same inputs, it always returns the exact same output.
2. It produces zero observable side effects (no network requests, no database writes, no file I/O, no reading system clocks or random number generators).

When calculation logic is mixed with infrastructure (e.g., querying current currency exchange rates inside a loop, reading `Date.now()`, or calling an LLM):

- Calculations become non-deterministic and impossible to reproduce reliably in audits.
- Unit tests require complex mock harnesses and network stubs.
- Performance degrades because CPU-bound math is throttled by I/O-bound network calls.

By keeping `packages/calc-engine` pure, we achieve sub-millisecond calculation runs, 100% branch test coverage, and mathematical auditability.

#### Trade-offs & Alternatives

- _Trade-off:_ The calling use-case (in `apps/web` or application layer) must gather all required inputs, exchange rates, and historical rule packs upfront before passing them into the calculation function.
- _Alternative:_ Allowing the calculation engine to fetch its own data on demand. Rejected because it violates Core Principle P-01 and breaks audit traceability.

#### Likely Follow-up Question

_How do you handle timestamps or date-dependent calculations (like historical royalty rate tiers) inside a pure calculation engine?_

#### Nimphy-Specific Practical Example

In Nimphy, `packages/calc-engine` will calculate book royalties based on declared retail prices, printing costs, and rule packs. The engine does not query the database for the rule pack or check the system clock. Instead, the application layer fetches the rule pack matching the calculation date and passes it as a pure parameter into `calculateRoyalty(inputs, rulePack)`.

---

### 9. How does Vitest work with React?

#### Interview-Ready Answer

Vitest executes React component tests in a headless Node.js environment by combining Vite's on-demand JSX transformation with `jsdom`, a JavaScript implementation of web standards (DOM, HTML, events). When a test renders a React component using React Testing Library, React mounts the component into `jsdom`'s simulated document, allowing assertions against rendered DOM nodes, accessibility roles, and text content.

#### Deep Technical Explanation

1. **Compilation:** When Vitest encounters a `.tsx` file, `@vitejs/plugin-react` transforms JSX syntax into standard JavaScript function calls (`jsx()` / `jsxs()` from `react/jsx-runtime`).
2. **Environment Simulation:** Vitest configures `environment: 'jsdom'`. In Node.js, `window`, `document`, `navigator`, and DOM nodes do not exist natively. `jsdom` creates and injects these globals into the Node runtime context.
3. **Rendering & Queries:** `@testing-library/react`'s `render()` method invokes `ReactDOM.createRoot()` on a container element inside `jsdom.document`.
4. **Assertions:** React Testing Library provides queries that search the simulated DOM tree using accessible roles (`getByRole`), labels (`getByLabelText`), or text (`getByText`), testing components from the perspective of an end user or assistive technology.

#### Trade-offs & Alternatives

- _Trade-off:_ `jsdom` does not perform real layout, rendering, or CSS box-model calculation (e.g., `element.offsetWidth` is always 0). Complex canvas, WebGL, or CSS animation tests cannot run in `jsdom`.
- _Alternative:_ Browser-based runners like Playwright component testing or Cypress. Slower and heavier, but run in real browser engines.

#### Likely Follow-up Question

_Why prefer React Testing Library queries like `getByRole` over CSS selectors like `querySelector('.btn-primary')`?_

#### Nimphy-Specific Practical Example

In `apps/web/app/page.test.tsx`, we test the disclaimer banner:

```typescript
render(<HomePage />);
const disclaimer = screen.getByRole('note', { name: /disclaimer/i });
expect(disclaimer.textContent).toContain('Illustrative Scenario Disclaimer');
```

This verifies that the banner is rendered with semantic HTML (`role="note"` and `aria-label="Disclaimer"`), ensuring both accessibility compliance and functional presence.

---

### 10. Why can JSX generate imports that are not written explicitly?

#### Interview-Ready Answer

JSX is not valid JavaScript; it is syntactic sugar that compilers must transform into standard function calls. Under the modern React JSX transform (introduced in React 17), the compiler automatically injects imports from `react/jsx-runtime` or `react/jsx-dev-runtime` into the compiled output file. Even if the developer never writes `import React from 'react'`, the generated code requires those runtime modules to execute.

#### Deep Technical Explanation

Historically (the "classic" runtime), JSX syntax like `<div className="title">Text</div>` was transformed into:

```javascript
React.createElement('div', { className: 'title' }, 'Text');
```

This required developers to write `import React from 'react'` at the top of every JSX file.

With the "automatic" runtime, the compiler transforms the same JSX into:

```javascript
import { jsx as _jsx } from 'react/jsx-runtime';
_jsx('div', { className: 'title', children: 'Text' });
```

In development mode, compilers (like Babel, SWC, or ESBuild via `@vitejs/plugin-react`) use `react/jsx-dev-runtime` to pass development debugging metadata (line numbers, column numbers, component stack):

```javascript
import { jsxDEV as _jsxDEV } from 'react/jsx-dev-runtime';
_jsxDEV('div', { ... }, key, isStaticChildren, source, self);
```

These imports are injected during compilation. If the runtime cannot locate the `react` package in its module resolution path, it crashes with `Cannot find module 'react/jsx-dev-runtime'`.

#### Trade-offs & Alternatives

- _Trade-off:_ Eliminates tedious boilerplate imports in user code, but can mask dependency requirements when tools operate across monorepo boundaries.
- _Alternative:_ Classic JSX runtime (`runtime: 'classic'`). Outdated and increases bundle sizes.

#### Likely Follow-up Question

_What is the difference between `react/jsx-runtime` and `react/jsx-dev-runtime` in terms of production bundle impact?_

#### Nimphy-Specific Practical Example

When Vitest ran our test in `apps/web/app/page.test.tsx`, Vite transformed `<main>` into a call to `_jsxDEV` from `'react/jsx-dev-runtime'`. Because this import was synthesized by the compiler, it failed until `react` was properly resolved in Vitest's execution context.

---

### 11. How did the `react/jsx-dev-runtime` issue occur, and how was it resolved?

#### Interview-Ready Answer

The issue occurred because Vitest was executed from the monorepo root, while React was installed exclusively within the `apps/web` package. Because pnpm uses strict, isolated dependency symlinking rather than hoisting packages to the root, Node's module resolution algorithm looking from the root directory could not resolve the compiler-injected `react/jsx-dev-runtime` dependency. We resolved it cleanly by adding React and React DOM as explicit root `devDependencies`.

#### Deep Technical Explanation

Here is the step-by-step failure mechanism:

1. `apps/web/package.json` had `react: "19.3.1"` and `react-dom: "19.3.1"`.
2. Root `package.json` ran `vitest run`.
3. Vitest started a Node process whose current working directory and entry context was `C:\Users\HP\Desktop\Projects\nimphy`.
4. Vitest discovered `apps/web/app/page.test.tsx` and compiled it using `@vitejs/plugin-react`.
5. The compiler injected `import { jsxDEV } from 'react/jsx-dev-runtime'`.
6. Node executed the transformed code. It attempted to resolve `react/jsx-dev-runtime` starting from `apps/web`, but the test runner's internal module loader evaluated the specifier against the root `node_modules`.
7. Under pnpm, the root `node_modules` only contained packages declared in the root `package.json`. Because `react` was not declared in root, no symlink existed in root `node_modules`.
8. Result: `Failed to resolve import "react/jsx-dev-runtime"`.

By adding `react` and `react-dom` to root `devDependencies`, pnpm created the required symlinks in root `node_modules`. The test ran and passed without altering a single line of component or test code.

#### Trade-offs & Alternatives

- _Trade-off:_ Declaring React at the monorepo root introduces a devDependency at the top level.
- _Alternative:_ Running Vitest from inside `apps/web` (`pnpm --filter @nimphy/web test`). While this works for the web package, it prevents running a unified, single-command monorepo test suite across all workspace packages from the root.

#### Likely Follow-up Question

_Why didn't pnpm just hoist React to the monorepo root automatically like npm or Yarn would have done?_

#### Nimphy-Specific Practical Example

In Nimphy, our root `package.json` now includes:

```json
"devDependencies": {
  "react": "19.3.1",
  "react-dom": "19.3.1",
  "vitest": "3.0.8"
}
```

This guarantees that any test file throughout the monorepo testing React components can resolve the JSX runtime deterministically.

---

### 12. Why use ESLint?

#### Interview-Ready Answer

ESLint is our static analysis engine for enforcing code quality, catching bugs before runtime, and maintaining stylistic and architectural uniformity. In Nimphy, ESLint does more than check syntax; it enforces accessibility standards via Next.js Core Web Vitals, catches React hook dependency bugs, prevents unused variables, and will serve as the primary enforcement mechanism for our module import boundaries.

#### Deep Technical Explanation

ESLint parses JavaScript and TypeScript into an Abstract Syntax Tree (AST) using `@typescript-eslint/parser`. It then walks the AST and triggers linting rules when specific AST node patterns are matched.
Key capabilities include:

- **Static Bug Prevention:** Catching unhandled promises, invalid hook dependencies (`react-hooks/exhaustive-deps`), or unreachable code.
- **Security & A11y:** Rules such as `jsx-a11y` prevent missing `alt` tags, inaccessible ARIA roles, or unsafe target attributes on links.
- **Custom Boundary Enforcement:** In STEP-002, ESLint will inspect `ImportDeclaration` AST nodes to verify that no file imports across forbidden package boundaries.

In STEP-001, we adopted ESLint 10's flat configuration (`eslint.config.mjs`), which uses native ES modules and eliminates the legacy, opaque `.eslintrc` configuration cascading rules.

#### Trade-offs & Alternatives

- _Trade-off:_ Linting adds compute time to CI pipelines and can produce false positives if rules are configured too aggressively.
- _Alternative:_ Biome (Rust-based linter/formatter). While Biome is much faster, ESLint's plugin ecosystem (specifically `eslint-config-next` and architectural boundary plugins) is currently essential for Next.js App Router projects.

#### Likely Follow-up Question

_How do you structure an ESLint configuration to format and lint different sub-packages with different rules in a monorepo?_

#### Nimphy-Specific Practical Example

In Nimphy's `eslint.config.mjs`, we import `eslint-config-next/core-web-vitals` and configure:

```javascript
{
  settings: {
    next: {
      rootDir: 'apps/web/',
    },
  },
}
```

This tells ESLint where the Next.js application lives so that Next-specific rules (like `next/no-html-link-for-pages`) evaluate relative to `apps/web/` without generating false positives across `packages/`.

---

### 13. Why use Prettier?

#### Interview-Ready Answer

Prettier is an opinionated code formatter that completely removes style debates and manual formatting from the engineering workflow. By enforcing a single, deterministic code style on save and in CI, Prettier eliminates bikeshedding during code reviews, ensures readable diffs, and prevents git line-ending conflicts across operating systems.

#### Deep Technical Explanation

Prettier works by parsing source code into an AST, discarding all original styling (spacing, line breaks, indentation), and re-printing the AST from scratch according to strict rules (print width, tab width, quote preferences).

Crucially, in cross-platform environments (Windows and Linux/macOS):

- Windows default line endings are CRLF (`\r\n`), while Linux/macOS use LF (`\n`).
- If unmanaged, Git commits will churn entire files simply due to line ending conversion, corrupting content hashes and git blame histories.
- Prettier's `"endOfLine": "lf"` setting, combined with `.gitattributes` (`* text=auto eol=lf`), guarantees that every formatted file on disk adheres to LF line endings.

#### Trade-offs & Alternatives

- _Trade-off:_ Prettier is deliberately non-configurable on many stylistic choices. Developers cannot customize niche formatting preferences.
- _Alternative:_ Using ESLint for both linting and formatting. Anti-pattern: ESLint is optimized for AST analysis, not pretty-printing. Mixing them causes rule conflicts and slow execution.

#### Likely Follow-up Question

_What happened in STEP-001 when Prettier checked our canonical architecture documents?_

#### Nimphy-Specific Practical Example

In STEP-001, running `prettier --check .` initially flagged lines in `docs/architecture/**` that exceeded standard print widths. Because the 23 architecture documents are canonical specifications that must not be modified by automated tooling, we added `docs/architecture/**` to `.prettierignore`.

---

### 14. Why commit a pnpm lockfile?

#### Interview-Ready Answer

Committing `pnpm-lock.yaml` is essential to guarantee deterministic, reproducible builds across all environments. A `package.json` file only specifies acceptable semver ranges (e.g., `^16.4.0`), meaning two installs performed days apart can resolve different minor or patch releases. The lockfile records the exact version, content integrity hash, and dependency graph of every package installed, ensuring that what runs on a developer's machine matches production exactly.

#### Deep Technical Explanation

When `pnpm install` runs without a lockfile:

1. It queries the npm registry for versions satisfying semver ranges in `package.json`.
2. If a dependency published a patch release (e.g., `16.4.1` replacing `16.4.0`), pnpm installs the new version.
3. This introduces non-determinism: a bug or breaking change in a transitive dependency can silently break CI or production even though no repository code changed.

With `pnpm-lock.yaml` committed:

- The exact resolved version is pinned.
- Every package has an integrity checksum (SHA-512 hash).
- In CI, running `pnpm install --frozen-lockfile` forces pnpm to fail immediately if the lockfile does not match `package.json` or requires modification, preventing unexpected drift.

#### Trade-offs & Alternatives

- _Trade-off:_ Lockfiles can produce merge conflicts during concurrent dependency updates that require careful resolution.
- _Alternative:_ Omitting lockfiles (common only in open-source libraries intended for broad consumption). Disastrous for applications.

#### Likely Follow-up Question

_What is the difference between `pnpm install` and `pnpm install --frozen-lockfile`?_

#### Nimphy-Specific Practical Example

In Nimphy's `.github/workflows/ci.yml`, the dependency installation step runs:

```yaml
- name: Install dependencies
  run: pnpm install --frozen-lockfile
```

If an engineer updates `package.json` locally but forgets to run `pnpm install` to update `pnpm-lock.yaml`, the CI runner rejects the pull request immediately.

---

### 15. What is the role of GitHub Actions in our engineering discipline?

#### Interview-Ready Answer

GitHub Actions serves as our automated gatekeeper, enforcing that no code can be merged into `main` unless it satisfies our Definition of Done. It executes a clean, reproducible verification matrix on an isolated virtual machine, validating that format, types, lints, tests, and production builds all pass before human review or deployment.

#### Deep Technical Explanation

Local environments are prone to hidden state:

- Uncommitted files or local environment variables.
- Cached build artifacts or lingering daemon processes.
- Differences in OS, file systems, or globally installed CLI tools.

GitHub Actions eliminates local bias by provisioning a clean Ubuntu runner (`ubuntu-latest`) for every push and pull request. In `.github/workflows/ci.yml`, it:

1. Clones the repository fresh (`actions/checkout@v4`).
2. Configures Node 24.18.0 and pnpm 10.34.5 with global store caching (`actions/setup-node@v4`).
3. Runs `pnpm install --frozen-lockfile`.
4. Executes the five verification gates sequentially: `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.
5. Uses concurrency groups (`group: ${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true`) to automatically terminate outdated CI runs when new commits are pushed to an open branch.

#### Trade-offs & Alternatives

- _Trade-off:_ Consumes cloud compute minutes and introduces wait time on pull requests.
- _Alternative:_ Git pre-commit hooks (Husky). We use CI as the authoritative gate because pre-commit hooks can be bypassed locally with `git commit --no-verify`.

#### Likely Follow-up Question

_How do you optimize CI run times as a monorepo grows from 8 packages to 50 packages?_

#### Nimphy-Specific Practical Example

In STEP-001, `.github/workflows/ci.yml` was established with the exact toolchain versions matching local development:

```yaml
- name: Install pnpm
  uses: pnpm/action-setup@v4
  with:
    version: 10.34.5
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: 24.18.0
    cache: 'pnpm'
```

---

### 16. What does a successful production build prove?

#### Interview-Ready Answer

A successful production build (`next build`) proves that the application can be compiled, bundled, minified, and optimized into a deployable production artifact without syntax errors, missing modules, or build-time rendering failures. In Next.js, it specifically validates that Server Components can be evaluated, static pages can be prerendered, and TypeScript types compile cleanly under Next.js's production compiler.

#### Deep Technical Explanation

During `pnpm dev`, Next.js compiles pages on demand as routes are requested. A page with broken imports, invalid syntax, or failing top-level server evaluation may sit undetected in the repository if no developer navigates to that specific route.

In contrast, `pnpm build`:

1. Executes `next build` using Turbopack.
2. Triggers an end-to-end TypeScript compilation check across all application code.
3. Treeshakes unused code, bundles assets, and minifies JavaScript/CSS.
4. Spawns worker threads to statically render static routes (`○ /` and `○ /_not-found`).
5. Generates the deployment manifest and `.next/standalone` production directory.

If any Server Component attempts to access client-only browser APIs (like `window` or `localStorage`) during server prerendering, the production build fails immediately.

#### Trade-offs & Alternatives

- _Trade-off:_ Running a production build takes significantly longer (approx. 10–20 seconds) than running a fast typecheck.
- _Alternative:_ Relying solely on `pnpm typecheck` or dev server checks. Insufficient because dev mode ignores bundle optimization, asset extraction, and static page generation errors.

#### Likely Follow-up Question

_Does a passing production build guarantee that the application has no runtime bugs?_

#### Nimphy-Specific Practical Example

In our STEP-001 verification, `pnpm build` completed in 7.4 seconds, confirming that Turbopack successfully resolved all seven workspace packages via `transpilePackages`, compiled Tailwind CSS directives, and statically prerendered `/` and `/_not-found`.

---

### 17. What does a passing typecheck NOT prove?

#### Interview-Ready Answer

A passing TypeScript check proves static type compatibility according to declared types, but it proves **nothing** about runtime data validity, algorithmic correctness, side-effect behavior, or system availability. TypeScript types are completely erased at compile time; if external data violates its schema, if business logic contains mathematical bugs, or if an external service fails, TypeScript cannot prevent a crash.

#### Deep Technical Explanation

Static typechecking (`tsc --noEmit`) provides compile-time guarantees within a closed type system. However, it cannot verify:

1. **External Boundary Data:** Data arriving over the network (HTTP requests, database rows, third-party webhooks) does not possess compile-time types. An API response typed as `User` can arrive as `null` or `{ error: "unauthorized" }`. Without schema validation (like Zod), TypeScript blindly trusts the developer's type assertion.
2. **Mathematical / Business Logic Correctness:** `calculateRoyalty(price, rate)` might return a negative number or round incorrectly. The function returns a `number`, satisfying TypeScript, but the financial calculation is wrong.
3. **Runtime Exceptions:** Out-of-memory errors, network timeouts, file system permissions, or unhandled promise rejections are invisible to the typechecker.
4. **CSS & Visual Layout:** TypeScript cannot verify if a button is obscured, if text contrast fails WCAG standards, or if responsive styling overflows on mobile screens.

#### Trade-offs & Alternatives

- _Trade-off:_ None; typechecking must always be complemented by automated runtime testing and runtime boundary validation.
- _Alternative:_ Relying on typechecking as the sole quality gate. High risk.

#### Likely Follow-up Question

_How does Nimphy bridge the gap between static types and runtime data validation at boundaries?_

#### Nimphy-Specific Practical Example

In Nimphy, Core Principle P-05 ("Verify at the boundary") dictates that TypeScript types alone are never trusted for incoming payloads. In STEP-012, all incoming HTTP requests to API route handlers will be validated at runtime using strict Zod schemas before being mapped into typed domain entities.

---

### 18. What is the distinction between a package stub and a real domain implementation?

#### Interview-Ready Answer

A package stub is an architectural placeholder that establishes a package's identity, directory structure, module resolution, and dependency graph without containing actual business logic. A real domain implementation contains the rich domain entities, value objects, business rules, invariant assertions, and domain events that model the problem space. Stubs allow us to establish and verify monorepo mechanics in STEP-001 without prematurely implementing domain logic reserved for future roadmap steps.

#### Deep Technical Explanation

In monorepo engineering, separating scaffolding from implementation is a vital discipline:

- **Package Stub:** Consists of `package.json` (defining name, version, and dependencies), `tsconfig.json` (defining compiler options), and a minimal entry point (`src/index.ts`) exporting basic module metadata (constants like `DOMAIN_MODULE_NAME = 'domain'`). Its sole purpose is to prove that the package manager links it, TypeScript compiles it, and consumers can import it without errors.
- **Real Domain Implementation:** Implements the Domain-Driven Design (DDD) model:
  - Branded types (`UserId`, `CaseId`, `Money`).
  - Entities with lifecycle state machines (`BusinessCase`, `CalculationRun`).
  - Invariant rules (e.g., "retail price must be strictly greater than print cost").
  - Value objects with deep equality and immutability guarantees.
  - Domain error classes with structured error codes.

Claiming that a package stub represents an implemented module is a common engineering mistake. Stubs must be clearly recognized as empty structural shells.

#### Trade-offs & Alternatives

- _Trade-off:_ Creating 7 package stubs in STEP-001 required writing boilerplate configuration files before writing functional code.
- _Alternative:_ Implementing packages incrementally only when needed. Rejected because establishing the full package topology upfront allows us to configure and verify global linting, typechecking, and transpile rules in a single scaffolding step.

#### Likely Follow-up Question

_What steps in the Nimphy roadmap turn these package stubs into functional implementations?_

#### Nimphy-Specific Practical Example

In Nimphy's `packages/calc-engine/src/index.ts`, the file currently contains:

```typescript
export const CALC_ENGINE_MODULE_NAME = 'calc-engine';
export const CALC_ENGINE_MODULE_VERSION = '0.1.0';
```

This is a stub. The real financial calculation engine—featuring 100% branch coverage, pure mathematical royalty calculations, break-even targets, and sensitivity analysis—will be implemented in STEP-005 through STEP-008.
