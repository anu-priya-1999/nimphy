import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_DEPENDENCIES,
  getPackageForFilePath,
  validateImportBoundary,
} from '../scripts/eslint-plugin-nimphy.mjs';
import {
  detectCycles,
  extractImportSpecifiers,
  validateArchitectureBoundaries,
  validatePackageManifests,
} from '../scripts/check-boundaries.mjs';

describe('Architecture Dependency Boundaries (check-boundaries & ESLint rule)', () => {
  const rootDir = path.resolve(__dirname, '..');

  describe('Real Repository Architectural Conformance', () => {
    it('verifies that all existing repository package manifests satisfy dependency boundaries', () => {
      const manifestResult = validatePackageManifests(rootDir);
      expect(manifestResult.valid).toBe(true);
      expect(manifestResult.errors).toEqual([]);
    });

    it('verifies that all existing source files satisfy architectural boundaries and form a clean DAG', () => {
      const result = validateArchitectureBoundaries(rootDir);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.fileCount).toBeGreaterThan(0);
      expect(result.checkedImports).toBeGreaterThan(0);
    });
  });

  describe('Package Resolution for File Paths', () => {
    it('correctly identifies workspace packages from file paths', () => {
      expect(getPackageForFilePath('C:/repo/packages/domain/src/index.ts')).toBe('@nimphy/domain');
      expect(getPackageForFilePath('/home/user/nimphy/packages/calc-engine/src/calc.ts')).toBe(
        '@nimphy/calc-engine',
      );
      expect(getPackageForFilePath('packages/rules/src/index.ts')).toBe('@nimphy/rules');
      expect(getPackageForFilePath('packages/ai/src/index.ts')).toBe('@nimphy/ai');
      expect(getPackageForFilePath('packages/documents/src/index.ts')).toBe('@nimphy/documents');
      expect(getPackageForFilePath('packages/payments/src/index.ts')).toBe('@nimphy/payments');
      expect(getPackageForFilePath('packages/persistence/src/index.ts')).toBe(
        '@nimphy/persistence',
      );
      expect(getPackageForFilePath('apps/web/app/page.tsx')).toBe('@nimphy/web');
      expect(getPackageForFilePath('scripts/check-docs.mjs')).toBeNull();
    });
  });

  describe('Import Boundary Validation Logic', () => {
    const domainFile = path.resolve(rootDir, 'packages/domain/src/index.ts');
    const calcFile = path.resolve(rootDir, 'packages/calc-engine/src/calc.ts');
    const webFile = path.resolve(rootDir, 'apps/web/app/page.tsx');

    it('allows valid inward-pointing dependency: @nimphy/calc-engine importing @nimphy/domain', () => {
      const result = validateImportBoundary(calcFile, '@nimphy/domain');
      expect(result.valid).toBe(true);
      expect(result.targetPackage).toBe('@nimphy/domain');
    });

    it('allows @nimphy/web to import approved workspace modules', () => {
      for (const target of ALLOWED_DEPENDENCIES['@nimphy/web']) {
        const result = validateImportBoundary(webFile, target);
        expect(result.valid).toBe(true);
      }
    });

    it('allows internal relative imports within the same package', () => {
      const result = validateImportBoundary(calcFile, './trace');
      expect(result.valid).toBe(true);

      const parentRelative = validateImportBoundary(calcFile, '../utils/math');
      expect(parentRelative.valid).toBe(true);
    });

    it('prohibits @nimphy/domain from importing @nimphy/calc-engine (reversing inward dependency)', () => {
      const result = validateImportBoundary(domainFile, '@nimphy/calc-engine');
      expect(result.valid).toBe(false);
      expect(result.errorType).toBe('prohibited-dependency');
      expect(result.message).toContain('Prohibited dependency');
    });

    it('prohibits @nimphy/domain from importing @nimphy/payments', () => {
      const result = validateImportBoundary(domainFile, '@nimphy/payments');
      expect(result.valid).toBe(false);
      expect(result.errorType).toBe('prohibited-dependency');
    });

    it('prohibits @nimphy/calc-engine from importing @nimphy/ai or @nimphy/payments', () => {
      const aiResult = validateImportBoundary(calcFile, '@nimphy/ai');
      expect(aiResult.valid).toBe(false);
      expect(aiResult.errorType).toBe('prohibited-dependency');

      const payResult = validateImportBoundary(calcFile, '@nimphy/payments');
      expect(payResult.valid).toBe(false);
      expect(payResult.errorType).toBe('prohibited-dependency');
    });

    it('prohibits deep imports that bypass package public entry points', () => {
      const deepDomain = validateImportBoundary(calcFile, '@nimphy/domain/src/index');
      expect(deepDomain.valid).toBe(false);
      expect(deepDomain.errorType).toBe('deep-import-bypass');
      expect(deepDomain.message).toContain('bypasses the public entry point');

      const deepCalc = validateImportBoundary(webFile, '@nimphy/calc-engine/src/calc');
      expect(deepCalc.valid).toBe(false);
      expect(deepCalc.errorType).toBe('deep-import-bypass');
    });

    it('prohibits relative imports that cross package boundaries', () => {
      const crossPkg = validateImportBoundary(calcFile, '../../domain/src/index');
      expect(crossPkg.valid).toBe(false);
      expect(crossPkg.errorType).toBe('relative-boundary-crossing');
      expect(crossPkg.message).toContain('crosses package boundaries');
    });

    it('prohibits self-import by package specifier', () => {
      const selfImport = validateImportBoundary(domainFile, '@nimphy/domain');
      expect(selfImport.valid).toBe(false);
      expect(selfImport.errorType).toBe('self-package-import');
    });

    it('enforces Principle P-01: calc-engine must have zero I/O, zero AI, and zero React', () => {
      expect(validateImportBoundary(calcFile, 'fs').valid).toBe(false);
      expect(validateImportBoundary(calcFile, 'node:fs').valid).toBe(false);
      expect(validateImportBoundary(calcFile, 'react').valid).toBe(false);
      expect(validateImportBoundary(calcFile, '@google/genai').valid).toBe(false);
      expect(validateImportBoundary(calcFile, 'pg').valid).toBe(false);
    });

    it('enforces AGENTS.md §2: domain must not import frameworks or database libraries', () => {
      expect(validateImportBoundary(domainFile, 'react').valid).toBe(false);
      expect(validateImportBoundary(domainFile, 'express').valid).toBe(false);
      expect(validateImportBoundary(domainFile, 'pg').valid).toBe(false);
      expect(validateImportBoundary(domainFile, 'drizzle-orm').valid).toBe(false);
    });
  });

  describe('Import Specifier Extraction', () => {
    it('correctly extracts imports, type imports, and re-exports', () => {
      const code = `
import { createMoney } from '@nimphy/domain';
import type { Money, CurrencyCode } from '@nimphy/domain';
export { CALC_VERSION } from './constants';
export * from './types';
export type { CalcResult } from './result';
// import { fake } from '@nimphy/ai';
const dynamic = await import('@nimphy/domain');
`;
      const specifiers = extractImportSpecifiers(code);
      expect(specifiers.length).toBe(6);
      expect(specifiers.map((s) => s.specifier)).toEqual([
        '@nimphy/domain',
        '@nimphy/domain',
        './constants',
        './types',
        './result',
        '@nimphy/domain',
      ]);
      expect(specifiers[1]?.isTypeOnly).toBe(true);
      expect(specifiers[4]?.isTypeOnly).toBe(true);
    });
  });

  describe('Cycle Detection Algorithm', () => {
    it('returns null for an acyclic dependency graph (DAG)', () => {
      const dag = {
        '@nimphy/web': ['@nimphy/calc-engine', '@nimphy/domain'],
        '@nimphy/calc-engine': ['@nimphy/domain'],
        '@nimphy/domain': [],
      };
      expect(detectCycles(dag)).toBeNull();
    });

    it('detects a cycle when dependencies form a loop', () => {
      const cyclic = {
        '@nimphy/domain': ['@nimphy/calc-engine'],
        '@nimphy/calc-engine': ['@nimphy/domain'],
      };
      const cycles = detectCycles(cyclic);
      expect(cycles).not.toBeNull();
      expect(cycles?.length).toBeGreaterThan(0);
      expect(cycles?.[0]).toContain('@nimphy/domain');
      expect(cycles?.[0]).toContain('@nimphy/calc-engine');
    });
  });
});
