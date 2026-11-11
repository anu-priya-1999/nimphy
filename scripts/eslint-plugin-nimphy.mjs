import path from 'node:path';

/**
 * Architectural dependency matrix based on AGENTS.md §2 and doc 03 §3.
 * Dependency arrows point strictly inward toward @nimphy/domain.
 */
export const ALLOWED_DEPENDENCIES = {
  '@nimphy/domain': [],
  '@nimphy/calc-engine': ['@nimphy/domain'],
  '@nimphy/rules': ['@nimphy/domain'],
  '@nimphy/ai': ['@nimphy/domain'],
  '@nimphy/documents': ['@nimphy/domain'],
  '@nimphy/payments': ['@nimphy/domain'],
  '@nimphy/persistence': ['@nimphy/domain'],
  '@nimphy/web': [
    '@nimphy/domain',
    '@nimphy/calc-engine',
    '@nimphy/rules',
    '@nimphy/ai',
    '@nimphy/documents',
    '@nimphy/payments',
    '@nimphy/persistence',
  ],
};

/**
 * All recognized workspace packages.
 */
export const WORKSPACE_PACKAGES = Object.keys(ALLOWED_DEPENDENCIES);

/**
 * Determines which workspace package a file path belongs to.
 * @param {string} filePath - Absolute or relative file path
 * @returns {string|null} - Package name (e.g. '@nimphy/domain') or null if outside packages/apps
 */
export function getPackageForFilePath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const withLeading = normalized.startsWith('/') ? normalized : `/${normalized}`;

  if (withLeading.includes('/packages/domain/')) return '@nimphy/domain';
  if (withLeading.includes('/packages/calc-engine/')) return '@nimphy/calc-engine';
  if (withLeading.includes('/packages/rules/')) return '@nimphy/rules';
  if (withLeading.includes('/packages/ai/')) return '@nimphy/ai';
  if (withLeading.includes('/packages/documents/')) return '@nimphy/documents';
  if (withLeading.includes('/packages/payments/')) return '@nimphy/payments';
  if (withLeading.includes('/packages/persistence/')) return '@nimphy/persistence';
  if (withLeading.includes('/apps/web/')) return '@nimphy/web';

  return null;
}

/**
 * Validates an import or export source from a file.
 * @param {string} sourceFile - Absolute or normalized file path of the importing file
 * @param {string} importPath - The import specifier string
 * @returns {{ valid: boolean, errorType?: string, message?: string, targetPackage?: string }}
 */
export function validateImportBoundary(sourceFile, importPath) {
  const sourcePkg = getPackageForFilePath(sourceFile);
  if (!sourcePkg) {
    // Outside monitored workspace packages (e.g., config files, test scripts)
    return { valid: true };
  }

  // 1. Check workspace package imports: @nimphy/*
  if (importPath.startsWith('@nimphy/')) {
    const segments = importPath.split('/');
    const basePkg = `@nimphy/${segments[1]}`;

    if (!WORKSPACE_PACKAGES.includes(basePkg)) {
      return {
        valid: false,
        errorType: 'unknown-package',
        message: `Package "${sourcePkg}" imports unknown workspace package "${basePkg}".`,
        targetPackage: basePkg,
      };
    }

    // Check for deep import bypassing public entry point (e.g., @nimphy/domain/src/...)
    if (segments.length > 2) {
      return {
        valid: false,
        errorType: 'deep-import-bypass',
        message: `Deep import "${importPath}" in "${sourcePkg}" bypasses the public entry point of "${basePkg}". Import from "${basePkg}" directly.`,
        targetPackage: basePkg,
      };
    }

    // Self-import by package name
    if (basePkg === sourcePkg) {
      return {
        valid: false,
        errorType: 'self-package-import',
        message: `Package "${sourcePkg}" imports itself via package specifier "${importPath}". Use relative paths within the same package.`,
        targetPackage: basePkg,
      };
    }

    // Check allowed dependency matrix
    const allowed = ALLOWED_DEPENDENCIES[sourcePkg] || [];
    if (!allowed.includes(basePkg)) {
      return {
        valid: false,
        errorType: 'prohibited-dependency',
        message: `Prohibited dependency: "${sourcePkg}" is not allowed to import "${basePkg}". Allowed dependencies: [${allowed.join(', ') || 'none'}]. (Principle P-01/P-02, AGENTS.md §2)`,
        targetPackage: basePkg,
      };
    }

    return { valid: true, targetPackage: basePkg };
  }

  // 2. Check relative imports (./ or ../)
  if (importPath.startsWith('.')) {
    const sourceDir = path.dirname(sourceFile);
    const resolvedPath = path.resolve(sourceDir, importPath).replace(/\\/g, '/');
    const targetPkg = getPackageForFilePath(resolvedPath);

    if (targetPkg && targetPkg !== sourcePkg) {
      // Relative import has traversed across package boundaries
      return {
        valid: false,
        errorType: 'relative-boundary-crossing',
        message: `Relative import "${importPath}" crosses package boundaries from "${sourcePkg}" into "${targetPkg}". Cross-package imports must use the package public specifier "${targetPkg}".`,
        targetPackage: targetPkg,
      };
    }

    return { valid: true };
  }

  // 3. Check prohibited external imports for pure packages
  // Principle P-01: calc-engine has zero I/O, zero AI, zero database, zero React
  if (sourcePkg === '@nimphy/calc-engine') {
    const prohibitedInCalcEngine = [
      'fs',
      'node:fs',
      'net',
      'node:net',
      'http',
      'node:http',
      'https',
      'node:https',
      'react',
      'react-dom',
      'next',
      '@google/genai',
      'openai',
      'anthropic',
      'pg',
      'postgres',
    ];
    if (prohibitedInCalcEngine.includes(importPath)) {
      return {
        valid: false,
        errorType: 'prohibited-external-import',
        message: `Principle P-01 Violation: @nimphy/calc-engine must be pure with zero I/O, zero AI, and zero framework imports. Found import of "${importPath}".`,
      };
    }
  }

  // Principle P-01/AGENTS.md: domain must not import frameworks or database libraries
  if (sourcePkg === '@nimphy/domain') {
    const prohibitedInDomain = [
      'react',
      'react-dom',
      'next',
      'express',
      'pg',
      'postgres',
      'drizzle-orm',
      'prisma',
      '@prisma/client',
    ];
    if (prohibitedInDomain.includes(importPath)) {
      return {
        valid: false,
        errorType: 'prohibited-external-import',
        message: `AGENTS.md §2 Violation: @nimphy/domain must not import from any framework or database library. Found import of "${importPath}".`,
      };
    }
  }

  return { valid: true };
}

/**
 * ESLint rule definition: architecture-boundaries
 */
export const architectureBoundariesRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce Nimphy architectural dependency boundaries and public interfaces',
      category: 'Architectural Boundaries',
      recommended: true,
    },
    schema: [],
    messages: {
      boundaryViolation: '{{message}}',
    },
  },
  create(context) {
    const filename = context.filename || (context.getFilename && context.getFilename()) || '';

    function checkImportNode(node) {
      if (!node.source || typeof node.source.value !== 'string') return;
      const importPath = node.source.value;

      const result = validateImportBoundary(filename, importPath);
      if (!result.valid) {
        context.report({
          node,
          messageId: 'boundaryViolation',
          data: {
            message: result.message,
          },
        });
      }
    }

    return {
      ImportDeclaration: checkImportNode,
      ExportNamedDeclaration: checkImportNode,
      ExportAllDeclaration: checkImportNode,
      ImportExpression(node) {
        if (
          node.source &&
          node.source.type === 'Literal' &&
          typeof node.source.value === 'string'
        ) {
          const result = validateImportBoundary(filename, node.source.value);
          if (!result.valid) {
            context.report({
              node,
              messageId: 'boundaryViolation',
              data: {
                message: result.message,
              },
            });
          }
        }
      },
    };
  },
};

/**
 * ESLint Flat Config Plugin Object
 */
export const nimphyEslintPlugin = {
  meta: {
    name: 'eslint-plugin-nimphy',
    version: '0.1.0',
  },
  rules: {
    'architecture-boundaries': architectureBoundariesRule,
  },
};

export default nimphyEslintPlugin;
