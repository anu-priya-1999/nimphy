import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_DEPENDENCIES,
  WORKSPACE_PACKAGES,
  getPackageForFilePath,
  validateImportBoundary,
} from './eslint-plugin-nimphy.mjs';

/**
 * Maps package directory relative paths to package names.
 */
export const PACKAGE_DIRS = {
  '@nimphy/domain': 'packages/domain',
  '@nimphy/calc-engine': 'packages/calc-engine',
  '@nimphy/rules': 'packages/rules',
  '@nimphy/ai': 'packages/ai',
  '@nimphy/documents': 'packages/documents',
  '@nimphy/payments': 'packages/payments',
  '@nimphy/persistence': 'packages/persistence',
  '@nimphy/web': 'apps/web',
};

/**
 * Validates package.json manifests across all workspace packages.
 * @param {string} rootDir
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePackageManifests(rootDir) {
  const errors = [];

  for (const [pkgName, relDir] of Object.entries(PACKAGE_DIRS)) {
    const manifestPath = path.resolve(rootDir, relDir, 'package.json');
    if (!fs.existsSync(manifestPath)) {
      errors.push(`Manifest missing for ${pkgName} at ${manifestPath}`);
      continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const dependencies = Object.keys(manifest.dependencies || {});
    const allowed = ALLOWED_DEPENDENCIES[pkgName] || [];

    // Check workspace dependencies declared
    const workspaceDeps = dependencies.filter((dep) => dep.startsWith('@nimphy/'));

    for (const dep of workspaceDeps) {
      if (!allowed.includes(dep)) {
        errors.push(
          `Manifest violation in ${pkgName}/package.json: Declares dependency on "${dep}", but architectural boundaries allow only: [${allowed.join(', ') || 'none'}].`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Recursively collects TypeScript source files in a directory.
 * @param {string} dir
 * @returns {string[]}
 */
export function collectSourceFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (['node_modules', '.next', 'dist', 'coverage', 'build'].includes(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.d.ts')
    ) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Extracts import/export specifiers and their line numbers from TypeScript code.
 * Handles static imports, type-only imports, re-exports, and dynamic imports.
 * @param {string} content
 * @returns {Array<{ specifier: string, line: number, raw: string, isTypeOnly: boolean }>}
 */
export function extractImportSpecifiers(content) {
  const results = [];
  // Strip block comments and inline comments, preserving line count
  const strippedLines = content.split(/\r?\n/).map((line) => {
    // strip single-line comments
    const commentIdx = line.indexOf('//');
    if (commentIdx !== -1) {
      return line.slice(0, commentIdx);
    }
    return line;
  });

  const cleanContent = strippedLines.join('\n');

  // Match import declarations:
  // import ... from 'specifier'
  // import type ... from 'specifier'
  // import 'specifier'
  const importRegex =
    /(?:import\s+(?:type\s+)?[\s\S]*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|export\s+(?:type\s+)?[\s\S]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\))/g;

  let match;
  while ((match = importRegex.exec(cleanContent)) !== null) {
    const specifier = match[1] || match[2] || match[3] || match[4];
    const matchIndex = match.index;
    // Calculate line number
    const line = cleanContent.slice(0, matchIndex).split('\n').length;
    const rawMatch = match[0];
    const isTypeOnly = /import\s+type\b|export\s+type\b/.test(rawMatch);

    results.push({
      specifier,
      line,
      raw: rawMatch,
      isTypeOnly,
    });
  }

  return results;
}

/**
 * Detects cycles in a directed graph using DFS.
 * @param {Record<string, string[]>} graph
 * @returns {string[][] | null} Cycles if detected
 */
export function detectCycles(graph) {
  const visited = new Set();
  const recursionStack = new Set();
  const cycles = [];

  function dfs(node, path) {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph[node] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, path);
      } else if (recursionStack.has(neighbor)) {
        const cycleStartIndex = path.indexOf(neighbor);
        cycles.push([...path.slice(cycleStartIndex), neighbor]);
      }
    }

    path.pop();
    recursionStack.delete(node);
  }

  for (const node of Object.keys(graph)) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }

  return cycles.length > 0 ? cycles : null;
}

/**
 * Validates architecture boundaries across all source code in the repository.
 * @param {string} rootDir
 * @returns {{ valid: boolean, errors: string[], fileCount: number, checkedImports: number, graph: Record<string, string[]> }}
 */
export function validateArchitectureBoundaries(rootDir) {
  const errors = [];
  let fileCount = 0;
  let checkedImports = 0;

  // 1. Validate package manifests first
  const manifestResult = validatePackageManifests(rootDir);
  if (!manifestResult.valid) {
    errors.push(...manifestResult.errors);
  }

  // 2. Collect all source files
  const sourceFiles = [];
  for (const relDir of Object.values(PACKAGE_DIRS)) {
    sourceFiles.push(...collectSourceFiles(path.resolve(rootDir, relDir)));
  }

  // Graph to track package-level dependencies for cycle detection
  const actualDependencyGraph = {};
  for (const pkg of WORKSPACE_PACKAGES) {
    actualDependencyGraph[pkg] = [];
  }

  for (const file of sourceFiles) {
    fileCount++;
    const content = fs.readFileSync(file, 'utf8');
    const imports = extractImportSpecifiers(content);
    const sourcePkg = getPackageForFilePath(file);
    const relFile = path.relative(rootDir, file).replace(/\\/g, '/');

    for (const imp of imports) {
      checkedImports++;
      const result = validateImportBoundary(file, imp.specifier);

      if (!result.valid) {
        errors.push(`${relFile}:${imp.line} Boundary Violation: ${result.message}`);
      } else if (result.targetPackage && sourcePkg && sourcePkg !== result.targetPackage) {
        if (!actualDependencyGraph[sourcePkg].includes(result.targetPackage)) {
          actualDependencyGraph[sourcePkg].push(result.targetPackage);
        }
      }
    }
  }

  // 3. Check for circular dependencies
  const cycles = detectCycles(actualDependencyGraph);
  if (cycles) {
    for (const cycle of cycles) {
      errors.push(`Circular package dependency detected: ${cycle.join(' -> ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    fileCount,
    checkedImports,
    graph: actualDependencyGraph,
  };
}

/**
 * Runs the boundary check script CLI.
 * @param {string} rootDir
 * @returns {{ success: boolean, errors: string[] }}
 */
export function runBoundaryCheck(rootDir = process.cwd()) {
  console.log('=== Nimphy Architecture Boundary Check ===\n');

  console.log('Validating workspace package dependencies and import boundaries...');
  const result = validateArchitectureBoundaries(rootDir);

  console.log(
    `\nChecked ${result.fileCount} source files across ${WORKSPACE_PACKAGES.length} packages.`,
  );
  console.log(`Verified ${result.checkedImports} import/export declarations.`);

  console.log('\nPackage Dependency Graph (Observed):');
  for (const [pkg, deps] of Object.entries(result.graph)) {
    console.log(`  ${pkg.padEnd(25)} -> [${deps.join(', ') || 'none'}]`);
  }

  console.log('\n=== Summary ===');
  if (result.valid) {
    console.log('✓ All architectural dependency boundaries strictly satisfied.\n');
    return { success: true, errors: [] };
  } else {
    console.error(
      `✗ Architectural boundary verification failed with ${result.errors.length} error(s):\n`,
    );
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    console.log();
    return { success: false, errors: result.errors };
  }
}

// CLI entrypoint
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const outcome = runBoundaryCheck(process.cwd());
  process.exit(outcome.success ? 0 : 1);
}
