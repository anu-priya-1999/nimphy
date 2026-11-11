# Nimphy

Nimphy is a publishing business-case and decision-intelligence product.

## Current development status

The initial project foundation is being scaffolded.
The first product capability is the Title Business Case.

See [the architecture documentation](docs/architecture/00-README.md)
for product scope, architecture and implementation roadmap.
For the long-term vision, 6-pillar capability framework, and strategic alignment, see [Product Strategy](docs/product-strategy.md).

## Requirements

- Node.js 24.18.0
- pnpm 10.34.5
- Git 2.40+

## Getting started

Every fresh clone must install dependencies and configure local Git hooks:

```powershell
# 1. Install dependencies
pnpm install

# 2. Configure repository Git hooks (required for every fresh clone)
pnpm setup:hooks

# 3. Start local web development server
pnpm dev
```

> **Note on Git hooks:** `pnpm setup:hooks` runs `git config --local core.hooksPath .githooks`. This activates the native Conventional Commit hook locally for the repository without altering global Git settings.

## Verification

Run the full verification suite locally:

```powershell
# Typechecking, linting, formatting
pnpm typecheck
pnpm lint
pnpm format:check

# Architectural boundaries & documentation integrity
pnpm docs:check
pnpm boundaries:check
pnpm arch:check

# Commit validation (latest commit or commit range)
pnpm commit:check --last

# Automated tests & production build
pnpm test
pnpm build
```

Consult `docs/DESIGN.md` for the current implementation status.
