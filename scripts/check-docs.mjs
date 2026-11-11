import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Expected 23 numbered architecture documents per doc 00 and doc 22.
 */
export const EXPECTED_ARCHITECTURE_DOCS = [
  '00-README.md',
  '01-executive-summary.md',
  '02-product-scope-and-requirements.md',
  '03-architecture-principles.md',
  '04-system-architecture.md',
  '05-component-responsibilities.md',
  '06-database-architecture-and-schema.md',
  '07-api-architecture.md',
  '08-event-schema-and-payment-lifecycle.md',
  '09-ai-architecture.md',
  '10-frontend-architecture.md',
  '11-security-and-privacy-architecture.md',
  '12-testing-and-ai-evaluation.md',
  '13-deployment-and-infrastructure.md',
  '14-local-development.md',
  '15-scaling-and-reliability.md',
  '16-cost-model.md',
  '17-implementation-roadmap.md',
  '18-architecture-decision-records.md',
  '19-risks-and-mitigations.md',
  '20-senior-engineering-interview-preparation.md',
  '21-hackathon-and-product-demo.md',
  '22-definition-of-done.md',
];

/**
 * Canonical ADR Status Vocabulary per doc 00 §6 and doc 18 §1.
 */
export const CANONICAL_ADR_STATUSES = ['Accepted', 'Proposed', 'Superseded', 'OPEN'];

/**
 * GitHub-compatible markdown heading slugger.
 * @param {string} text
 * @returns {string}
 */
export function slugifyHeading(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '') // strip HTML tags
    .replace(/`([^`]+)`/g, '$1') // strip code fences
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // strip markdown links
    .replace(/\*\*([^*]+)\*\*/g, '$1') // strip bold
    .replace(/\*([^*]+)\*/g, '$1') // strip italic
    .replace(/[^\w\s-]/g, '') // remove non-word chars (except spaces & hyphens)
    .trim()
    .replace(/\s+/g, '-'); // replace spaces with hyphens
}

/**
 * Extracts headings and anchor IDs from a markdown content string.
 * @param {string} content
 * @returns {Set<string>}
 */
export function extractAnchorsFromMarkdown(content) {
  const anchors = new Set();
  const slugCounts = new Map();

  // Strip code blocks first
  const stripped = content.replace(/```[\s\S]*?```/g, '');
  const lines = stripped.split(/\r?\n/);

  for (const line of lines) {
    // Markdown headings: # Heading, ## Heading, etc.
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      const headingText = headingMatch[1].trim();
      const baseSlug = slugifyHeading(headingText);
      if (baseSlug) {
        const count = slugCounts.get(baseSlug) || 0;
        const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;
        slugCounts.set(baseSlug, count + 1);
        anchors.add(slug);
      }
    }

    // Explicit HTML anchors: <a id="..."> or <a name="...">
    const htmlAnchorRegex = /<a\s+(?:[^>]*?\s+)?(?:id|name)=["']([^"']+)["']/gi;
    let htmlMatch;
    while ((htmlMatch = htmlAnchorRegex.exec(line)) !== null) {
      anchors.add(htmlMatch[1]);
    }
  }

  return anchors;
}

/**
 * Strip code blocks, inline code, and HTML comments from markdown text.
 * @param {string} content
 * @returns {string}
 */
export function stripCodeAndComments(content) {
  return content
    .replace(/<!--[\s\S]*?-->/g, '') // HTML comments
    .replace(/```[\s\S]*?```/g, (match) => ' '.repeat(match.length)) // fenced code (preserving char positions/lines)
    .replace(/`[^`\r\n]+`/g, (match) => ' '.repeat(match.length)); // inline code
}

/**
 * Extracts all markdown links from markdown content.
 * @param {string} content
 * @returns {Array<{ text: string, target: string, line: number, raw: string }>}
 */
export function extractMarkdownLinks(content) {
  const cleanContent = stripCodeAndComments(content);
  const links = [];
  const lines = cleanContent.split(/\r?\n/);

  const linkRegex = /!?\[([^\]]*)\]\(([^)]+)\)/g;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    let match;
    while ((match = linkRegex.exec(line)) !== null) {
      const rawTarget = match[2].trim();
      // Split off optional title e.g. [text](url "title")
      let target = rawTarget;
      const titleMatch = target.match(/^(\S+)\s+["'].*["']$/);
      if (titleMatch) {
        target = titleMatch[1];
      }

      links.push({
        text: match[1],
        target,
        line: lineIndex + 1,
        raw: match[0],
      });
    }
  }

  return links;
}

/**
 * Validates the architecture document inventory in docs/architecture.
 * @param {string} archDir - Path to docs/architecture directory
 * @returns {{ valid: boolean, errors: string[], files: string[] }}
 */
export function validateArchitectureInventory(archDir) {
  const errors = [];
  if (!fs.existsSync(archDir)) {
    return {
      valid: false,
      errors: [`Architecture directory does not exist: ${archDir}`],
      files: [],
    };
  }

  const entries = fs.readdirSync(archDir, { withFileTypes: true });
  const actualMdFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort();

  // Check count
  if (actualMdFiles.length !== EXPECTED_ARCHITECTURE_DOCS.length) {
    errors.push(
      `Expected exactly ${EXPECTED_ARCHITECTURE_DOCS.length} architecture documents, but found ${actualMdFiles.length}.`,
    );
  }

  // Check expected files presence
  for (const expected of EXPECTED_ARCHITECTURE_DOCS) {
    if (!actualMdFiles.includes(expected)) {
      errors.push(`Missing required architecture document: ${expected}`);
    }
  }

  // Check for unexpected extra files
  for (const actual of actualMdFiles) {
    if (!EXPECTED_ARCHITECTURE_DOCS.includes(actual)) {
      errors.push(`Unexpected extra document in architecture directory: ${actual}`);
    }
  }

  // Check duplicate number prefixes
  const numberPrefixes = new Map();
  for (const file of actualMdFiles) {
    const prefixMatch = file.match(/^(\d{2})-/);
    if (prefixMatch) {
      const num = prefixMatch[1];
      if (numberPrefixes.has(num)) {
        errors.push(
          `Duplicate document number prefix "${num}": "${numberPrefixes.get(num)}" and "${file}".`,
        );
      } else {
        numberPrefixes.set(num, file);
      }
    } else {
      errors.push(
        `Architecture document "${file}" does not follow the "NN-name.md" numbering convention.`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    files: actualMdFiles,
  };
}

/**
 * Validates internal markdown links across repository documents.
 * @param {string} rootDir - Repository root directory
 * @param {string[]} targetDirs - Directories to inspect (relative to rootDir)
 * @returns {{ valid: boolean, errors: string[], checkedFiles: number, checkedLinks: number }}
 */
export function validateMarkdownLinks(rootDir, targetDirs = ['docs', 'learning', 'prompts']) {
  const errors = [];
  let checkedFiles = 0;
  let checkedLinks = 0;

  /**
   * Recursively collect markdown files.
   * @param {string} dir
   * @returns {string[]}
   */
  function collectMdFiles(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (['node_modules', '.git', '.next', 'dist', 'coverage', 'build'].includes(entry.name)) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectMdFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const filesToCheck = [];
  for (const targetDir of targetDirs) {
    filesToCheck.push(...collectMdFiles(path.resolve(rootDir, targetDir)));
  }

  // Also include root markdown files
  for (const rootFile of ['README.md', 'AGENTS.md']) {
    const fullPath = path.resolve(rootDir, rootFile);
    if (fs.existsSync(fullPath)) {
      filesToCheck.push(fullPath);
    }
  }

  // Cache parsed markdown anchors
  const anchorCache = new Map();
  function getAnchors(filePath) {
    if (!anchorCache.has(filePath)) {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const content = fs.readFileSync(filePath, 'utf8');
        anchorCache.set(filePath, extractAnchorsFromMarkdown(content));
      } else {
        anchorCache.set(filePath, new Set());
      }
    }
    return anchorCache.get(filePath);
  }

  for (const file of filesToCheck) {
    checkedFiles++;
    const content = fs.readFileSync(file, 'utf8');
    const links = extractMarkdownLinks(content);
    const relSourcePath = path.relative(rootDir, file).replace(/\\/g, '/');

    for (const link of links) {
      const target = link.target;

      // Ignore external protocols
      if (
        target.startsWith('http://') ||
        target.startsWith('https://') ||
        target.startsWith('mailto:') ||
        target.startsWith('ftp://')
      ) {
        continue;
      }

      // Ignore pure in-page fragment-only links unless required
      if (target.startsWith('#')) {
        continue;
      }

      checkedLinks++;

      // Split path and optional anchor
      const [pathPart, anchorPart] = target.split('#');
      let decodedPath;
      try {
        decodedPath = decodeURIComponent(pathPart);
      } catch {
        errors.push(
          `${relSourcePath}:${link.line} Broken link: Failed to decode URI component in target "${target}"`,
        );
        continue;
      }

      const containingDir = path.dirname(file);
      const resolvedTarget = path.resolve(containingDir, decodedPath);

      if (!fs.existsSync(resolvedTarget)) {
        errors.push(
          `${relSourcePath}:${link.line} Broken local link: "${target}" (resolved to non-existent path: "${path.relative(rootDir, resolvedTarget).replace(/\\/g, '/')}")`,
        );
        continue;
      }

      // If an anchor was specified and target is a file, verify the anchor
      if (anchorPart && fs.statSync(resolvedTarget).isFile()) {
        const decodedAnchor = decodeURIComponent(anchorPart);
        const targetAnchors = getAnchors(resolvedTarget);

        // Normalize anchor check: check exact slug or slugified form
        const slugified = slugifyHeading(decodedAnchor);
        if (!targetAnchors.has(decodedAnchor) && !targetAnchors.has(slugified)) {
          errors.push(
            `${relSourcePath}:${link.line} Broken anchor in link "${target}": Anchor "#${decodedAnchor}" not found in target file "${path.relative(rootDir, resolvedTarget).replace(/\\/g, '/')}"`,
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    checkedFiles,
    checkedLinks,
  };
}

/**
 * Validates documentation status vocabulary in docs/architecture.
 * Specifically checks ADR status conventions in 18-architecture-decision-records.md.
 * @param {string} archDir - Path to docs/architecture directory
 * @returns {{ valid: boolean, errors: string[], adrCount: number, adrStatuses: Record<string, string> }}
 */
export function validateDocumentationStatusVocabulary(archDir) {
  const errors = [];
  const adrFilePath = path.join(archDir, '18-architecture-decision-records.md');

  if (!fs.existsSync(adrFilePath)) {
    return {
      valid: false,
      errors: [`ADR document not found: ${adrFilePath}`],
      adrCount: 0,
      adrStatuses: {},
    };
  }

  const content = fs.readFileSync(adrFilePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const adrStatuses = {};

  // Extract from index table: | NNN | Title | Status |
  const tableRowRegex = /^\|\s*(\d{3})\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|$/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(tableRowRegex);
    if (match) {
      const adrId = `ADR-${match[1]}`;
      const statusRaw = match[3].trim();

      // Normalize status: extract canonical status word
      let parsedStatus = null;
      for (const canonical of CANONICAL_ADR_STATUSES) {
        // Look for whole-word match or markdown bold match
        const regex = new RegExp(`\\b${canonical}\\b`, 'i');
        if (regex.test(statusRaw)) {
          parsedStatus = canonical;
          break;
        }
      }

      if (!parsedStatus) {
        errors.push(
          `18-architecture-decision-records.md:${i + 1} Unrecognized status in index table for ${adrId}: "${statusRaw}". Allowed vocabulary: ${CANONICAL_ADR_STATUSES.join(', ')}`,
        );
      } else {
        adrStatuses[adrId] = parsedStatus;
      }
    }
  }

  // Extract from ADR section headings: ## ADR-NNN Title — Status
  const headingRegex = /^##\s+(ADR-\d{3})\s+([^—\n]+)—\s*(.+)$/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(headingRegex);
    if (match) {
      const adrId = match[1];
      const headingStatusRaw = match[3].trim();

      let headingStatus = null;
      for (const canonical of CANONICAL_ADR_STATUSES) {
        const regex = new RegExp(`\\b${canonical}\\b`, 'i');
        if (regex.test(headingStatusRaw)) {
          headingStatus = canonical;
          break;
        }
      }

      if (!headingStatus) {
        errors.push(
          `18-architecture-decision-records.md:${i + 1} Unrecognized status in heading for ${adrId}: "${headingStatusRaw}". Allowed vocabulary: ${CANONICAL_ADR_STATUSES.join(', ')}`,
        );
      } else if (adrStatuses[adrId] && adrStatuses[adrId] !== headingStatus) {
        errors.push(
          `18-architecture-decision-records.md:${i + 1} Status mismatch for ${adrId}: Table index declares "${adrStatuses[adrId]}", but heading declares "${headingStatus}".`,
        );
      }
    }
  }

  // Verify that all 22 ADRs (ADR-001 through ADR-022) are accounted for
  for (let num = 1; num <= 22; num++) {
    const adrId = `ADR-${String(num).padStart(3, '0')}`;
    if (!adrStatuses[adrId]) {
      errors.push(
        `Missing status declaration in 18-architecture-decision-records.md for ${adrId}.`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    adrCount: Object.keys(adrStatuses).length,
    adrStatuses,
  };
}

/**
 * Runs all documentation checks.
 * @param {string} rootDir
 * @returns {{ success: boolean, results: Record<string, any> }}
 */
export function runAllDocumentationChecks(rootDir = process.cwd()) {
  const archDir = path.resolve(rootDir, 'docs', 'architecture');

  console.log('=== Nimphy Documentation Validation ===\n');

  console.log('1. Checking architecture document inventory...');
  const inventoryResult = validateArchitectureInventory(archDir);
  if (inventoryResult.valid) {
    console.log(
      `   ✓ All ${inventoryResult.files.length} architecture documents present and uniquely numbered.`,
    );
  } else {
    console.error(`   ✗ Architecture inventory failed (${inventoryResult.errors.length} errors):`);
    for (const err of inventoryResult.errors) {
      console.error(`     - ${err}`);
    }
  }

  console.log('\n2. Validating markdown links and anchors...');
  const linksResult = validateMarkdownLinks(rootDir);
  if (linksResult.valid) {
    console.log(
      `   ✓ All ${linksResult.checkedLinks} internal links verified across ${linksResult.checkedFiles} markdown files.`,
    );
  } else {
    console.error(`   ✗ Link validation failed (${linksResult.errors.length} errors):`);
    for (const err of linksResult.errors) {
      console.error(`     - ${err}`);
    }
  }

  console.log('\n3. Validating documentation status vocabulary...');
  const statusResult = validateDocumentationStatusVocabulary(archDir);
  if (statusResult.valid) {
    console.log(
      `   ✓ Verified status vocabulary for ${statusResult.adrCount} ADRs (${CANONICAL_ADR_STATUSES.join(', ')}).`,
    );
  } else {
    console.error(
      `   ✗ Status vocabulary validation failed (${statusResult.errors.length} errors):`,
    );
    for (const err of statusResult.errors) {
      console.error(`     - ${err}`);
    }
  }

  const allPassed = inventoryResult.valid && linksResult.valid && statusResult.valid;

  console.log('\n=== Summary ===');
  if (allPassed) {
    console.log('✓ All documentation validation checks passed successfully.\n');
    return {
      success: true,
      results: { inventoryResult, linksResult, statusResult },
    };
  } else {
    const totalErrors =
      inventoryResult.errors.length + linksResult.errors.length + statusResult.errors.length;
    console.error(`✗ Documentation validation failed with ${totalErrors} total error(s).\n`);
    return {
      success: false,
      results: { inventoryResult, linksResult, statusResult },
    };
  }
}

// CLI entrypoint
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const outcome = runAllDocumentationChecks(process.cwd());
  process.exit(outcome.success ? 0 : 1);
}
