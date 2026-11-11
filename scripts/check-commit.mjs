import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Standard Conventional Commit types per Section 4.
 */
export const ALLOWED_COMMIT_TYPES = [
  'feat',
  'fix',
  'docs',
  'refactor',
  'test',
  'build',
  'ci',
  'chore',
  'perf',
  'revert',
];

/**
 * Common workspace scopes for Nimphy.
 */
export const RECOMMENDED_SCOPES = [
  'domain',
  'calc-engine',
  'rules',
  'ai',
  'documents',
  'payments',
  'persistence',
  'web',
  'architecture',
  'docs',
  'ci',
  'deps',
  'root',
  'scripts',
  'security',
  'release',
  'infra',
  'tooling',
  'boundaries',
];

/**
 * Strips comments from git commit messages (lines starting with #).
 * @param {string} rawMessage
 * @returns {string}
 */
export function stripCommitComments(rawMessage) {
  return rawMessage
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
    .trim();
}

/**
 * Checks whether a Git SHA is an all-zero SHA (e.g. initial push or new branch in GitHub Actions).
 * @param {string | undefined | null} sha
 * @returns {boolean}
 */
export function isZeroSha(sha) {
  if (typeof sha !== 'string') return true;
  const trimmed = sha.trim();
  return trimmed === '' || /^0+$/.test(trimmed);
}

/**
 * Validates a single commit message according to Conventional Commits standards.
 * @param {string} message - Commit message string
 * @returns {{ valid: boolean, errors: string[], warnings: string[], parsed?: object }}
 */
export function validateCommitMessage(message) {
  const errors = [];
  const warnings = [];

  const cleanMessage = stripCommitComments(message);
  if (!cleanMessage) {
    return {
      valid: false,
      errors: ['Commit message is empty.'],
      warnings: [],
    };
  }

  const lines = cleanMessage.split(/\r?\n/);
  const header = lines[0].trim();

  // Validate line 2 separation if body exists
  if (lines.length > 1) {
    const line2 = lines[1].trim();
    if (line2 !== '') {
      errors.push('Second line of commit message must be blank (separating header from body).');
    }
  }

  // Check for empty description: header ends with colon and optional spaces
  const emptyDescRegex = /^([a-zA-Z0-9_-]+)(?:\(([a-zA-Z0-9_\-\/]+)\))?(!)?:\s*$/;
  if (emptyDescRegex.test(header)) {
    errors.push('Commit description must not be empty.');
    return {
      valid: false,
      errors,
      warnings,
    };
  }

  // Header regex: type(scope)!: description OR type!: description OR type(scope): description OR type: description
  // Requires at least one whitespace character after the colon (\s+)
  const headerRegex = /^([a-zA-Z0-9_-]+)(?:\(([a-zA-Z0-9_\-\/]+)\))?(!)?:\s+(.+)$/;
  const match = header.match(headerRegex);

  if (!match) {
    errors.push(
      `Commit header "${header}" does not match conventional commit format: "type(scope): description" or "type: description".`,
    );
    return {
      valid: false,
      errors,
      warnings,
    };
  }

  const [, rawType, scope, breaking, description] = match;
  const type = rawType.toLowerCase();

  // Check type
  if (!ALLOWED_COMMIT_TYPES.includes(type)) {
    errors.push(
      `Invalid commit type "${rawType}". Allowed types: [${ALLOWED_COMMIT_TYPES.join(', ')}].`,
    );
  }

  // Check description
  if (!description || description.trim().length === 0) {
    errors.push('Commit description must not be empty.');
  } else {
    const trimmedDesc = description.trim();
    if (trimmedDesc.endsWith('.')) {
      errors.push('Commit description must not end with a period (".").');
    }
  }

  // Header length checks
  if (header.length > 100) {
    errors.push(
      `Commit header exceeds maximum length of 100 characters (actual: ${header.length}).`,
    );
  } else if (header.length > 72) {
    warnings.push(
      `Commit header exceeds recommended length of 72 characters (actual: ${header.length}).`,
    );
  }

  // Scope advice (warning only, if scope is unusual)
  if (scope && !RECOMMENDED_SCOPES.includes(scope.toLowerCase())) {
    warnings.push(
      `Scope "${scope}" is non-standard. Recommended scopes include: [${RECOMMENDED_SCOPES.slice(0, 10).join(', ')}, ...].`,
    );
  }

  const parsed = {
    type,
    scope: scope || null,
    isBreaking: Boolean(breaking),
    description: description ? description.trim() : '',
    header,
    body: lines.slice(2).join('\n').trim(),
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    parsed,
  };
}

/**
 * Retrieves non-merge commits from Git within a specified revision range.
 *
 * Excludes merge commits (`--no-merges`) because merge commits (such as
 * 'Merge branch ...' or 'Merge pull request ...') are automatically generated
 * by Git or GitHub and do not carry author-provided conventional commit messages.
 *
 * Safely handles an all-zero before SHA (e.g. from GitHub Actions new branch push).
 *
 * @param {object} options
 * @param {string} [options.range] - Git revision range (e.g. 'base..head')
 * @param {string} [options.from] - Base revision / before SHA
 * @param {string} [options.to='HEAD'] - Head revision / current SHA
 * @param {string} [options.cwd=process.cwd()] - Working directory
 * @returns {{ commits: Array<{ hash: string, subject: string, message: string }>, range: string, emptyRepo?: boolean, error?: string }}
 */
export function getCommitsInRange(options = {}) {
  const cwd = options.cwd || process.cwd();

  // Check if repository has any commits at all
  let repoHasCommits = false;
  try {
    execSync('git rev-parse --verify HEAD', { stdio: 'ignore', cwd });
    repoHasCommits = true;
  } catch {
    repoHasCommits = false;
  }

  if (!repoHasCommits) {
    return { commits: [], range: options.range || '', emptyRepo: true };
  }

  let revRange = options.range;

  if (!revRange) {
    const from = options.from;
    const to = options.to || 'HEAD';

    if (isZeroSha(from)) {
      // New branch push: from SHA is all zeroes.
      // Attempt to compare against origin/main if present, or fallback to the target commit.
      let hasOriginMain = false;
      try {
        execSync('git rev-parse --verify origin/main', { stdio: 'ignore', cwd });
        hasOriginMain = true;
      } catch {
        hasOriginMain = false;
      }

      if (hasOriginMain) {
        try {
          const originMainRev = execSync('git rev-parse origin/main', {
            encoding: 'utf8',
            cwd,
          }).trim();
          const targetRev = execSync(`git rev-parse ${to}`, { encoding: 'utf8', cwd }).trim();
          if (originMainRev !== targetRev) {
            revRange = `origin/main..${to}`;
          }
        } catch {
          // ignore error
        }
      }

      if (!revRange) {
        // Fall back to checking the single target commit
        revRange = `-1 ${to}`;
      }
    } else if (from) {
      revRange = `${from}..${to}`;
    } else {
      revRange = `-1 ${to}`;
    }
  }

  try {
    // Record separator: \x1e, Unit separator: \x1f
    // Format: %H (hash) \x1f %s (subject) \x1f %B (raw body) \x1e
    const rawOutput = execSync(`git log --no-merges --format="%H%x1f%s%x1f%B%x1e" ${revRange}`, {
      encoding: 'utf8',
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    if (!rawOutput.trim()) {
      return { commits: [], range: revRange };
    }

    const records = rawOutput
      .split('\x1e')
      .map((r) => r.trim())
      .filter(Boolean);

    const commits = records.map((record) => {
      const [hash, subject, ...rest] = record.split('\x1f');
      const bodyAndFooter = rest.join('\x1f').trim();
      return {
        hash: (hash || '').trim(),
        subject: (subject || '').trim(),
        message: bodyAndFooter || (subject || '').trim(),
      };
    });

    return { commits, range: revRange };
  } catch (err) {
    return { error: err.message, commits: [], range: revRange };
  }
}

/**
 * Validates an array of commit objects against Conventional Commits.
 *
 * @param {Array<{ hash: string, subject: string, message: string }>} commits
 * @param {object} [options]
 * @param {boolean} [options.silent=false]
 * @param {string} [options.range]
 * @returns {{ success: boolean, total: number, validCount: number, invalidCount: number, invalidCommits: Array<object>, validCommits: Array<object>, range?: string }}
 */
export function validateCommitList(commits, options = {}) {
  const silent = Boolean(options.silent);
  const range = options.range || 'specified range';

  const validCommits = [];
  const invalidCommits = [];

  for (const commit of commits) {
    const result = validateCommitMessage(commit.message);
    if (result.valid) {
      validCommits.push({ ...commit, result });
    } else {
      invalidCommits.push({ ...commit, result });
    }
  }

  if (invalidCommits.length === 0) {
    if (!silent) {
      console.log(
        `✓ All ${commits.length} non-merge commit(s) in range "${range}" are valid Conventional Commits:`,
      );
      for (const c of validCommits) {
        console.log(`  - ${c.hash ? c.hash.slice(0, 7) : 'commit'}: ${c.subject}`);
      }
    }
    return {
      success: true,
      total: commits.length,
      validCount: validCommits.length,
      invalidCount: 0,
      validCommits,
      invalidCommits: [],
      range,
    };
  }

  if (!silent) {
    console.error(
      `✗ Conventional commit validation failed for ${invalidCommits.length} of ${commits.length} commit(s) in range "${range}":\n`,
    );
    for (const inv of invalidCommits) {
      console.error(`  - Commit: ${inv.hash || 'unknown'}`);
      console.error(`    Subject: "${inv.subject}"`);
      console.error('    Errors:');
      for (const err of inv.result.errors) {
        console.error(`      * ${err}`);
      }
      for (const warn of inv.result.warnings) {
        console.warn(`      ! Warning: ${warn}`);
      }
      console.error('');
    }
    console.error('Expected format: <type>(<scope>): <description>');
    console.error(`Allowed types: ${ALLOWED_COMMIT_TYPES.join(', ')}`);
    console.error('Examples:');
    console.error('  feat(calc-engine): add break-even calculation');
    console.error('  fix(payments): prevent duplicate capture');
    console.error('  docs(architecture): clarify case deletion');
  }

  return {
    success: false,
    total: commits.length,
    validCount: validCommits.length,
    invalidCount: invalidCommits.length,
    validCommits,
    invalidCommits,
    range,
  };
}

/**
 * Validates all non-merge commits in a given revision range.
 *
 * @param {object} options
 * @param {string} [options.range] - Revision range (e.g. 'base..head')
 * @param {string} [options.from] - Base revision
 * @param {string} [options.to] - Target revision
 * @param {string} [options.cwd=process.cwd()]
 * @param {boolean} [options.silent=false]
 * @returns {{ success: boolean, total: number, skipped?: boolean, invalidCount?: number, validCount?: number, range: string, error?: string }}
 */
export function validateCommitRange(options = {}) {
  const silent = Boolean(options.silent);

  const { commits, range, error, emptyRepo } = getCommitsInRange(options);

  if (emptyRepo) {
    if (!silent) {
      console.log('Notice: Repository has no git commits yet. Skipping commit history check.');
    }
    return { success: true, skipped: true, total: 0, range };
  }

  if (error) {
    if (!silent) {
      console.error(`✗ Error: Could not retrieve commits for range "${range}": ${error}`);
    }
    return { success: false, total: 0, range, error };
  }

  if (commits.length === 0) {
    if (!silent) {
      console.log(`Notice: No non-merge commits found in range "${range}". Validation skipped.`);
    }
    return { success: true, skipped: true, total: 0, range };
  }

  return validateCommitList(commits, { ...options, range });
}

/**
 * Validates a single commit message string or file.
 * @param {string} commitMessage
 * @param {object} [options]
 * @returns {{ success: boolean, skipped?: boolean, errors?: string[] }}
 */
function handleSingleMessageValidation(commitMessage, options = {}) {
  const silent = Boolean(options.silent);
  const result = validateCommitMessage(commitMessage);

  if (result.valid) {
    if (!silent) {
      console.log(`✓ Conventional commit message valid: "${result.parsed?.header}"`);
      for (const w of result.warnings) {
        console.warn(`  Warning: ${w}`);
      }
    }
    return { success: true };
  } else {
    if (!silent) {
      console.error('✗ Conventional commit validation failed:');
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
      for (const w of result.warnings) {
        console.warn(`  Warning: ${w}`);
      }
      console.error('\nExpected format: <type>(<scope>): <description>');
      console.error(`Allowed types: ${ALLOWED_COMMIT_TYPES.join(', ')}`);
      console.error('Examples:');
      console.error('  feat(calc-engine): add break-even calculation');
      console.error('  fix(payments): prevent duplicate capture');
      console.error('  docs(architecture): clarify case deletion');
      console.error('  test(domain): add money value tests');
    }
    return { success: false, errors: result.errors };
  }
}

/**
 * Main CLI execution logic.
 *
 * Supports:
 * - `pnpm commit:check --last`: validates the latest commit (preserves local convenience)
 * - `pnpm commit:check --range <range>`: validates a commit range (e.g. 'main..HEAD')
 * - `pnpm commit:check --from <sha> --to <sha>`: validates range between two SHAs
 * - `pnpm commit:check --ci`: reads CI environment variables (pull request base/head or push before/after)
 * - `pnpm commit:check <message-or-file>`: validates a specific message string or file path
 *
 * @param {string[]} [args=process.argv.slice(2)]
 * @param {object} [options={}]
 * @returns {{ success: boolean, skipped?: boolean, total?: number, invalidCount?: number }}
 */
export function runCommitCheck(args = process.argv.slice(2), options = {}) {
  const cwd = options.cwd || process.cwd();

  // 1. Check for explicit range arguments: --range <range>
  const rangeIdx = args.indexOf('--range');
  if (rangeIdx !== -1 && args[rangeIdx + 1]) {
    return validateCommitRange({ range: args[rangeIdx + 1], cwd, silent: options.silent });
  }

  // 2. Check for explicit from/to arguments: --from <sha> [--to <sha>]
  const fromIdx = args.indexOf('--from');
  if (fromIdx !== -1 && args[fromIdx + 1]) {
    const toIdx = args.indexOf('--to');
    const from = args[fromIdx + 1];
    const to = toIdx !== -1 && args[toIdx + 1] ? args[toIdx + 1] : 'HEAD';
    return validateCommitRange({ from, to, cwd, silent: options.silent });
  }

  // 3. Check for CI execution flag: --ci
  if (args.includes('--ci')) {
    const eventName = process.env.EVENT_NAME || process.env.GITHUB_EVENT_NAME;

    if (eventName === 'pull_request') {
      const base = process.env.PR_BASE_SHA || process.env.GITHUB_BASE_REF;
      const head = process.env.PR_HEAD_SHA || process.env.GITHUB_HEAD_REF || 'HEAD';
      if (base) {
        if (!options.silent) {
          console.log(`Validating pull request non-merge commits: ${base}..${head}`);
        }
        return validateCommitRange({ from: base, to: head, cwd, silent: options.silent });
      }
    } else if (eventName === 'push') {
      const before = process.env.PUSH_BEFORE_SHA;
      const after = process.env.PUSH_AFTER_SHA || process.env.GITHUB_SHA || 'HEAD';
      if (!options.silent) {
        console.log(
          `Validating push non-merge commits: before=${before || '0000000000000000000000000000000000000000'}, after=${after}`,
        );
      }
      return validateCommitRange({ from: before, to: after, cwd, silent: options.silent });
    }

    // Direct environment variables fallback
    if (process.env.PR_BASE_SHA && process.env.PR_HEAD_SHA) {
      return validateCommitRange({
        from: process.env.PR_BASE_SHA,
        to: process.env.PR_HEAD_SHA,
        cwd,
        silent: options.silent,
      });
    }
    if (process.env.PUSH_BEFORE_SHA) {
      return validateCommitRange({
        from: process.env.PUSH_BEFORE_SHA,
        to: process.env.PUSH_AFTER_SHA || process.env.GITHUB_SHA || 'HEAD',
        cwd,
        silent: options.silent,
      });
    }

    // Fall back to checking the latest commit
    args = ['--last'];
  }

  // 4. Single commit or message checks
  let commitMessage = '';

  if (args.length > 0) {
    const arg = args[0];
    if (arg === '--last') {
      try {
        commitMessage = execSync('git log -1 --pretty=%B', { encoding: 'utf8', cwd }).trim();
      } catch {
        if (!options.silent) {
          console.log('Notice: Repository has no git commits yet. Skipping commit history check.');
        }
        return { success: true, skipped: true };
      }
    } else if (arg === '--message' || arg === '-m') {
      commitMessage = args[1] || '';
    } else if (fs.existsSync(path.resolve(cwd, arg))) {
      commitMessage = fs.readFileSync(path.resolve(cwd, arg), 'utf8');
    } else {
      // Direct string message passed
      commitMessage = arg;
    }
  } else {
    // Default: try to check git log -1, or if COMMIT_EDITMSG exists
    const editMsgPath = path.resolve(cwd, '.git', 'COMMIT_EDITMSG');
    if (fs.existsSync(editMsgPath)) {
      commitMessage = fs.readFileSync(editMsgPath, 'utf8');
    } else {
      try {
        commitMessage = execSync('git log -1 --pretty=%B', { encoding: 'utf8', cwd }).trim();
      } catch {
        if (!options.silent) {
          console.log('Notice: No commit message supplied and no git history present.');
          console.log('Usage: node scripts/check-commit.mjs "type(scope): description"');
          console.log('       node scripts/check-commit.mjs .git/COMMIT_EDITMSG');
          console.log('       node scripts/check-commit.mjs --last');
          console.log('       node scripts/check-commit.mjs --range <base>..<head>');
          console.log('       node scripts/check-commit.mjs --from <sha> --to <sha>');
          console.log('       node scripts/check-commit.mjs --ci');
        }
        return { success: true, skipped: true };
      }
    }
  }

  return handleSingleMessageValidation(commitMessage, options);
}

// CLI entrypoint
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const outcome = runCommitCheck(process.argv.slice(2));
  process.exit(outcome.success ? 0 : 1);
}
