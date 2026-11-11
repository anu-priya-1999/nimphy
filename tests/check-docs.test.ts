import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EXPECTED_ARCHITECTURE_DOCS,
  CANONICAL_ADR_STATUSES,
  extractAnchorsFromMarkdown,
  extractMarkdownLinks,
  slugifyHeading,
  validateArchitectureInventory,
  validateDocumentationStatusVocabulary,
  validateMarkdownLinks,
} from '../scripts/check-docs.mjs';

describe('Documentation Validation Tooling (check-docs)', () => {
  const rootDir = path.resolve(__dirname, '..');
  const archDir = path.resolve(rootDir, 'docs', 'architecture');

  describe('Architecture Document Inventory', () => {
    it('verifies that all 23 required architecture documents are present in canonical repository', () => {
      const result = validateArchitectureInventory(archDir);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.files.length).toBe(23);
      expect(result.files).toEqual([...EXPECTED_ARCHITECTURE_DOCS].sort());
    });

    it('detects missing architecture documents in a directory', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-inv-missing-'));
      try {
        // Create only 2 files
        fs.writeFileSync(path.join(tempDir, '00-README.md'), '# 00 README');
        fs.writeFileSync(path.join(tempDir, '01-executive-summary.md'), '# 01 Exec');

        const result = validateArchitectureInventory(tempDir);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Expected exactly 23'))).toBe(true);
        expect(
          result.errors.some((e) =>
            e.includes(
              'Missing required architecture document: 02-product-scope-and-requirements.md',
            ),
          ),
        ).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('detects duplicate numbering prefixes and unexpected extra files', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-inv-dup-'));
      try {
        // Copy all 23 expected docs
        for (const doc of EXPECTED_ARCHITECTURE_DOCS) {
          fs.writeFileSync(path.join(tempDir, doc), `# ${doc}`);
        }
        // Add a duplicate numbering prefix: 01-duplicate.md
        fs.writeFileSync(path.join(tempDir, '01-duplicate.md'), '# Duplicate 01');
        // Add an unexpected file
        fs.writeFileSync(path.join(tempDir, 'extra-doc.md'), '# Extra');

        const result = validateArchitectureInventory(tempDir);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Duplicate document number prefix "01"'))).toBe(
          true,
        );
        expect(
          result.errors.some((e) =>
            e.includes('Unexpected extra document in architecture directory'),
          ),
        ).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Markdown Link and Anchor Validation', () => {
    it('verifies that all internal links in the repository markdown files resolve correctly', () => {
      const result = validateMarkdownLinks(rootDir);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.checkedLinks).toBeGreaterThan(0);
      expect(result.checkedFiles).toBeGreaterThan(0);
    });

    it('correctly handles heading slugification matching GitHub markdown rules', () => {
      expect(slugifyHeading('1. High-level architecture')).toBe('1-high-level-architecture');
      expect(slugifyHeading('ADR-001 Modular monolith — Proposed')).toBe(
        'adr-001-modular-monolith-proposed',
      );
      expect(slugifyHeading('Principles & Constraints (Core)')).toBe('principles-constraints-core');
      expect(slugifyHeading('Code block `foo_bar` test')).toBe('code-block-foo_bar-test');
      expect(slugifyHeading('**Bold** and *Italic* text')).toBe('bold-and-italic-text');
    });

    it('extracts anchors and duplicate heading disambiguation', () => {
      const markdown = `
# Main Title
## Subsection
## Subsection
<a id="custom-anchor"></a>
`;
      const anchors = extractAnchorsFromMarkdown(markdown);
      expect(anchors.has('main-title')).toBe(true);
      expect(anchors.has('subsection')).toBe(true);
      expect(anchors.has('subsection-1')).toBe(true);
      expect(anchors.has('custom-anchor')).toBe(true);
    });

    it('ignores markdown links inside fenced code blocks and inline code', () => {
      const markdown = `
[Valid Link](01-executive-summary.md)

\`\`\`markdown
[Fenced Code Link](non-existent-file-in-code.md)
\`\`\`

Here is inline code: \`[Inline Code Link](another-non-existent.md)\`
`;
      const links = extractMarkdownLinks(markdown);
      expect(links.length).toBe(1);
      expect(links[0]?.target).toBe('01-executive-summary.md');
    });

    it('detects invalid relative links to non-existent files', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-links-invalid-'));
      try {
        const fileA = path.join(tempDir, 'fileA.md');
        fs.writeFileSync(fileA, 'Link to missing: [Missing File](non-existent-doc.md)');

        const result = validateMarkdownLinks(tempDir, ['.']);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0]).toContain('non-existent-doc.md');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('validates relative links with anchors, passing valid anchors and rejecting invalid anchors', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-links-anchors-'));
      try {
        const targetFile = path.join(tempDir, 'target.md');
        fs.writeFileSync(
          targetFile,
          '# Target Document\n\n## Section One\n\nContent here.\n\n## Section Two\n\nMore content.',
        );

        const sourceFile = path.join(tempDir, 'source.md');
        fs.writeFileSync(
          sourceFile,
          '[Valid Section](target.md#section-one)\n[Broken Section](target.md#non-existent-section)',
        );

        const result = validateMarkdownLinks(tempDir, ['.']);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0]).toContain('non-existent-section');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('ignores external HTTP, HTTPS, and mailto links', () => {
      const markdown = `
[External Google](https://google.com)
[External Insecure](http://insecure.org/page)
[Contact Support](mailto:support@nimphy.com)
[FTP](ftp://ftp.example.com)
`;
      const links = extractMarkdownLinks(markdown);
      expect(links.length).toBe(4);

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-links-ext-'));
      try {
        fs.writeFileSync(path.join(tempDir, 'test.md'), markdown);
        const result = validateMarkdownLinks(tempDir, ['.']);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Documentation Status Vocabulary', () => {
    it('verifies that all 22 canonical ADRs in 18-architecture-decision-records.md use valid status vocabulary', () => {
      const result = validateDocumentationStatusVocabulary(archDir);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.adrCount).toBe(22);

      // Verify each ADR status is in canonical vocabulary
      for (let i = 1; i <= 22; i++) {
        const adrId = `ADR-${String(i).padStart(3, '0')}`;
        const status = result.adrStatuses[adrId];
        expect(status).toBeDefined();
        expect(CANONICAL_ADR_STATUSES).toContain(status);
      }
    });

    it('detects unrecognized ADR status values in mock ADR document', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adr-status-invalid-'));
      try {
        const adrContent = `
# 18 Architecture Decision Records

| ADR | Title | Status |
|---|---|---|
| 001 | Test ADR | Approved |

## ADR-001 Test ADR — Approved
Status: Approved
`;
        fs.writeFileSync(path.join(tempDir, '18-architecture-decision-records.md'), adrContent);

        const result = validateDocumentationStatusVocabulary(tempDir);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Unrecognized status'))).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('detects status mismatch between index table and heading', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adr-status-mismatch-'));
      try {
        const adrContent = `
# 18 Architecture Decision Records

| ADR | Title | Status |
|---|---|---|
| 001 | Test ADR | Proposed |

## ADR-001 Test ADR — Accepted
Status: Accepted
`;
        fs.writeFileSync(path.join(tempDir, '18-architecture-decision-records.md'), adrContent);

        const result = validateDocumentationStatusVocabulary(tempDir);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Status mismatch for ADR-001'))).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
