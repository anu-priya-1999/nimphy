# Technical Notes & Engineering Reference — STEP-001: Project Scaffolding

This document provides technical reference notes, architectural definitions, operational commands, and lessons learned during the scaffolding of the Nimphy repository in **STEP-001**.

---

## 1. pnpm Workspace Concepts

### Monorepo Layout

A pnpm workspace coordinates multiple packages within a single git repository. In Nimphy, the workspace boundary is declared at the root in `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
allowBuilds:
  esbuild: true
```

### Content-Addressable Store & Symlinking

- Unlike npm or Yarn v1, pnpm does not duplicate packages across the monorepo or flatten dependencies into a single hoisted `node_modules`.
- Package artifacts are stored once in a content-addressable store on disk and hard-linked into `.pnpm/<package>@<version>/node_modules/<package>`.
- Individual workspace packages receive isolated `node_modules` containing symbolic links only to dependencies declared in their respective `package.json`.
- This strictly eliminates **phantom dependencies** (importing packages that happen to be hoisted but are not declared in `package.json`).

### The Workspace Protocol (`workspace:*`)

Internal package references use the `workspace:*` specifier in `dependencies`:

```json
{
  "dependencies": {
    "@nimphy/domain": "workspace:*"
  }
}
```

- During local development, pnpm resolves `@nimphy/domain` directly to the local directory `packages/domain`.
- If packages are published or packed, pnpm replaces `workspace:*` with the matching semver version.

---

## 2. Runtime & Package Manager Pinning

### Node.js Pinned to 24.18.0 (Active LTS)

- **`.nvmrc`:** Specifies `24.18.0`. Developers using `nvm` or `fnm` execute `nvm use` to align their runtime.
- **Root `package.json` `engines` field:**
  ```json
  "engines": {
    "node": ">=24.18.0 <25"
  }
  ```
  Enforces that package managers and deployment hosts run on Node 24.

### pnpm Pinned to 10.34.5 via `packageManager`

- Defined in root `package.json`:
  ```json
  "packageManager": "pnpm@10.34.5"
  ```

````
- Corepack uses this field to ensure developers automatically invoke pnpm 10.34.5 without manual global installations.

---

## 3. Strict TypeScript Configuration

Nimphy enforces strict static typing using a layered `tsconfig` hierarchy.

### `tsconfig.base.json` (Shared Strict Rules)
Extends compiler options to enforce total type rigor:
- `"strict": true`: Activates `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, and `alwaysStrict`.
- `"noUncheckedIndexedAccess": true`: Array lookups (`arr[i]`) and record lookups (`dict[key]`) return `T | undefined`, preventing undefined property access.
- `"noImplicitReturns": true`: Functions must return explicitly from all code paths.
- `"noFallthroughCasesInSwitch": true`: Switch statements cannot fall through unintentionally.
- `"noUnusedLocals": true` & `"noUnusedParameters": true`: Dead variables fail compilation.
- `"moduleResolution": "bundler"`: Aligns with modern bundlers (Next.js Turbopack and Vite).
- `"target": "ES2022"`: Emits modern ECMAScript features.

### `tsconfig.json` (Root Path Aliases)
Maps package import specifiers to source code paths:
```json
{
  "baseUrl": ".",
  "paths": {
    "@nimphy/domain": ["packages/domain/src"],
    "@nimphy/calc-engine": ["packages/calc-engine/src"],
    "@nimphy/rules": ["packages/rules/src"],
    "@nimphy/ai": ["packages/ai/src"],
    "@nimphy/documents": ["packages/documents/src"],
    "@nimphy/payments": ["packages/payments/src"],
    "@nimphy/persistence": ["packages/persistence/src"]
  }
}
````

Allows editors and test runners to navigate and resolve types directly across workspaces.

---

## 4. Next.js App Router Basics

### Architecture in `apps/web`

- **Root Directory:** Next.js 16 App Router uses `apps/web/app/` as the routing root.
- **Root Layout (`app/layout.tsx`):**
  - Defines the outer HTML shell (`<html lang="en">`, `<body>`).
  - Configures Inter font via `next/font/google`.
  - Injects viewport metadata (`width=device-width`, `initial-scale=1`).
- **Home Route (`app/page.tsx`):**
  - Evaluates on the server by default (React Server Component).
  - Statically prerendered at build time (`○ /`).
  - Displays the mandatory **Illustrative Scenario Disclaimer** banner.
- **Global Styles (`app/globals.css`):**
  - Injects Tailwind CSS directives (`@tailwind base; @tailwind components; @tailwind utilities;`).

### Workspace Transpilation (`apps/web/next.config.mjs`)

Next.js Turbopack must know which monorepo packages to compile:

```javascript
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@nimphy/ai',
    '@nimphy/calc-engine',
    '@nimphy/documents',
    '@nimphy/domain',
    '@nimphy/payments',
    '@nimphy/persistence',
    '@nimphy/rules',
  ],
};
```

Without `transpilePackages`, importing from uncompiled sibling packages fails during bundling.

---

## 5. React Server Components & JSX Transformation

### React Server Components (RSC) vs. Client Components

- By default, all components in the Next.js App Router are Server Components.
- Server Components execute only on the server, output pure HTML/JSON, and ship zero JavaScript bundle to the browser.
- Components requiring user interactivity (event handlers like `onClick`, React hooks like `useState`, `useEffect`) must include the `'use client'` directive at the top of the file.
- In STEP-001, `apps/web/app/page.tsx` is 100% server-rendered.

### JSX Transformation Mechanics

- Modern React JSX transforms JSX syntax (`<h1>Title</h1>`) into function calls (`_jsx('h1', { children: 'Title' })`).
- The compiler automatically injects imports from `react/jsx-runtime` (production) or `react/jsx-dev-runtime` (development).
- If the test runner or bundler cannot locate `react` in its module search path, JSX execution crashes.

---

## 6. ESLint 10 Flat Configuration

### Flat Config Architecture (`eslint.config.mjs`)

ESLint 10 has deprecated legacy `.eslintrc.*` files in favor of flat configuration arrays:

```javascript
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: {
        rootDir: 'apps/web/',
      },
    },
  },
  globalIgnores([
    '.next/**',
    '**/.next/**',
    'out/**',
    '**/out/**',
    'build/**',
    '**/build/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    'next-env.d.ts',
    '**/next-env.d.ts',
    'pnpm-lock.yaml',
    '.pnpm-store/**',
  ]),
]);
```

- Direct integration of Next.js 16 modular packages.
- Explicit `rootDir: 'apps/web/'` configuration ensures Next.js rules resolve project routes correctly.
- Global ignores prevent linting of build artifacts and lockfiles.

---

## 7. Prettier Ignore Rules & LF Line Endings

### Configuration (`.prettierrc`)

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "lf"
}
```

### Git Attributes (`.gitattributes`)

```
* text=auto eol=lf
```

Forces Git on Windows to check out and commit files with LF (`\n`) rather than CRLF (`\r\n`), ensuring cross-platform hash reproducibility.

### Ignore Scopes (`.prettierignore`)

```
node_modules
.next
dist
build
coverage
pnpm-lock.yaml
.pnpm-store
.git

docs/architecture/**

**/next-env.d.ts
```

- `docs/architecture/**`: Preserves the 23 canonical architecture documents exactly as authored.
- `**/next-env.d.ts`: Prevents formatting collisions with Next.js compiler-generated type declarations.

---

## 8. Vitest with jsdom & React Testing Library

### Test Harness Setup (`vitest.config.ts`)

```typescript
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['apps/**/*.test.{ts,tsx}', 'packages/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/web'),
      '@nimphy/domain': path.resolve(__dirname, './packages/domain/src'),
      '@nimphy/calc-engine': path.resolve(__dirname, './packages/calc-engine/src'),
      '@nimphy/rules': path.resolve(__dirname, './packages/rules/src'),
      '@nimphy/ai': path.resolve(__dirname, './packages/ai/src'),
      '@nimphy/documents': path.resolve(__dirname, './packages/documents/src'),
      '@nimphy/payments': path.resolve(__dirname, './packages/payments/src'),
      '@nimphy/persistence': path.resolve(__dirname, './packages/persistence/src'),
    },
  },
});
```

### Testing Strategy

- **`environment: 'jsdom'`:** Injects simulated browser DOM APIs into Node.
- **`@testing-library/react`:** Renders components and queries using accessibility-first roles (`screen.getByRole`).
- **Root Resolution:** Root `devDependencies` include `react`, `react-dom`, `@types/react`, and `@types/react-dom` so that Vitest can resolve JSX runtimes when executing monorepo-wide tests.

---

## 9. Lockfile Reproducibility

### The Role of `pnpm-lock.yaml`

- Records the cryptographic content hash (integrity) and exact version of every direct and transitive dependency.
- Guarantees identical package resolution across developer workstations and CI runners.

### Frozen Lockfile Enforcement

- `pnpm install --frozen-lockfile` aborts with an error if the lockfile would be modified by the installation.
- Used in CI to prevent accidental dependency drift.

---

## 10. Production Build vs. Development Server

| Aspect           | `pnpm dev` (`next dev`)     | `pnpm build` (`next build`)                      |
| ---------------- | --------------------------- | ------------------------------------------------ |
| **Compilation**  | On-demand per visited route | Full upfront ahead-of-time compilation           |
| **Compiler**     | Turbopack dev mode          | Turbopack production optimizer                   |
| **Optimization** | Fast refresh, sourcemaps    | Minification, dead code elimination, CSS purging |
| **Prerendering** | Dynamic on request          | Static page rendering (`○ /`, `○ /_not-found`)   |
| **Typechecking** | Incremental / editor-level  | Strict full-project type compilation             |
| **Speed**        | Instant startup (<1s)       | Full compilation (approx. 7–15s)                 |

---

## 11. Continuous Integration Architecture

The GitHub Actions workflow in `.github/workflows/ci.yml`:

1. **Trigger:** Push to `main` or pull request to `main`.
2. **Concurrency:** `cancel-in-progress: true` prevents redundant runner usage on rapid pushes.
3. **Runner:** `ubuntu-latest`.
4. **Execution Sequence:**
   - `actions/checkout@v4`
   - `pnpm/action-setup@v4` (pnpm 10.34.5)
   - `actions/setup-node@v4` (Node 24.18.0 with `cache: 'pnpm'`)
   - `pnpm install --frozen-lockfile`
   - `pnpm format:check`
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm test`
   - `pnpm build`

---

## 12. Environment Variable Management

- **`.env.example`:** Committed template documenting all expected configuration keys per `docs/architecture/14-local-development.md`:
  - `DATABASE_URL` (Postgres connection string)
  - `SESSION_SECRET` (Session signing key)
  - `PAYPAL_ENV`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`
  - `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`
  - `APP_BASE_URL`
  - Feature flags: `FEATURE_CHECKOUT_ENABLED`, `FEATURE_AI_MEMO_ENABLED`
  - Safety and lifecycle budgets: `AI_DAILY_BUDGET_USD`, `PAYPAL_ORDER_TTL_MINUTES`, etc.
- **Git Safety:** `.gitignore` explicitly ignores `.env`, `.env.local`, `.env.*.local`, ensuring credentials are never committed.

---

## 13. Known Warnings (Verified Non-Fatal)

During local verification, the following notices were documented:

1. **Peer Dependency Warnings:** ESLint plugin peer dependency ranges end at ESLint 9 (`^8.0.0 || ^9.0.0`), while root runs ESLint `10.14.0`. The plugins execute successfully under ESLint 10 without runtime errors.
2. **Transitive Deprecation:** `whatwg-encoding` is marked deprecated within transitive `jsdom` dependencies. This is managed upstream by `jsdom`.
3. **Ignored Build Script:** pnpm logged an ignored build script for `esbuild` during install, which was resolved by adding `allowBuilds: { esbuild: true }` in `pnpm-workspace.yaml`.

---

## 14. Troubleshooting & Verification Commands

```powershell
# Install dependencies strictly matching lockfile
pnpm install --frozen-lockfile

# Typecheck all 8 projects in the workspace
pnpm typecheck

# Lint all code using flat ESLint configuration
pnpm lint

# Check code formatting without writing changes
pnpm format:check

# Format code across the repository
pnpm format

# Run all unit and smoke tests
pnpm test

# Build production bundle of Next.js application
pnpm build

# Start local Next.js development server
pnpm dev

# Check git whitespace and line ending integrity
git diff --check
```

---

## 15. Lessons Learned in STEP-001

1. **Root-Level Monorepo Testing Requires Root-Level Runtimes:**
   When running Vitest from the monorepo root across packages, shared runtime libraries like React must be present in the root `devDependencies` so that Vite plugins can resolve generated modules (`react/jsx-dev-runtime`) under strict pnpm symlink isolation.
2. **ESLint 10 Flat Config Outperforms Legacy Compat:**
   Using direct modular imports from `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` in `eslint.config.mjs` is cleaner, faster, and more reliable than trying to bridge legacy `.eslintrc` structures with `FlatCompat`.
3. **Protect Canonical Documents Early:**
   Formatters like Prettier must be instructed early to ignore canonical specification documents (`docs/architecture/**`) and generated type declarations (`next-env.d.ts`) to avoid accidental specification mutation and git churn.
4. **Enforce Clean Module Boundaries Upfront:**
   Establishing workspace package stubs and path aliases at the scaffolding stage enables end-to-end typechecking across the entire system before any domain logic is written.
