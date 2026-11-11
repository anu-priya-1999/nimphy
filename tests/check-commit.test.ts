import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ALLOWED_COMMIT_TYPES,
  getCommitsInRange,
  isZeroSha,
  stripCommitComments,
  validateCommitList,
  validateCommitMessage,
  validateCommitRange,
} from '../scripts/check-commit.mjs';

describe('Conventional Commit Validation (check-commit)', () => {
  describe('Valid Commit Messages', () => {
    it('accepts valid conventional commits for each allowed type with a scope', () => {
      const examples = [
        'feat(calc-engine): add break-even calculation',
        'fix(payments): prevent duplicate capture',
        'docs(architecture): clarify case deletion',
        'refactor(web): extract disclaimer banner into reusable component',
        'test(domain): add money value tests and boundary checks',
        'build(deps): pin pnpm to version 10.34.5',
        'ci(workflow): add boundary checking step',
        'chore(deps): update devDependencies',
        'perf(calc-engine): optimize matrix evaluation loop',
        'revert(payments): revert temporary capture bypass',
      ];

      for (const msg of examples) {
        const result = validateCommitMessage(msg);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(ALLOWED_COMMIT_TYPES).toContain(result.parsed?.type);
      }
    });

    it('accepts valid conventional commits without a scope', () => {
      const result = validateCommitMessage('chore: update root license and readme');
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.parsed?.type).toBe('chore');
      expect(result.parsed?.scope).toBeNull();
      expect(result.parsed?.description).toBe('update root license and readme');
    });

    it('accepts breaking change indicator (!)', () => {
      const scopedBreaking = validateCommitMessage(
        'feat(calc-engine)!: redesign calculation trace schema',
      );
      expect(scopedBreaking.valid).toBe(true);
      expect(scopedBreaking.parsed?.isBreaking).toBe(true);

      const unscopedBreaking = validateCommitMessage('refactor!: drop deprecated legacy types');
      expect(unscopedBreaking.valid).toBe(true);
      expect(unscopedBreaking.parsed?.isBreaking).toBe(true);
    });

    it('accepts multiline commit messages with blank second line', () => {
      const message = `feat(payments): implement canonical paypal capture endpoint

This endpoint (EP-023) ensures that only one server-side capture path exists,
preventing duplicate capture attempts and client-side race conditions.

Refs: ADR-020, EP-023
Closes #105`;

      const result = validateCommitMessage(message);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.parsed?.body).toContain('This endpoint (EP-023)');
      expect(result.parsed?.body).toContain('Closes #105');
    });

    it('correctly strips git comment lines starting with #', () => {
      const gitCommentedMessage = `feat(domain): add money value object
# Please enter the commit message for your changes. Lines starting
# with '#' will be ignored, and an empty message aborts the commit.
#
# On branch main
# Changes to be committed:
#	modified:   packages/domain/src/index.ts
`;
      const stripped = stripCommitComments(gitCommentedMessage);
      expect(stripped).toBe('feat(domain): add money value object');

      const result = validateCommitMessage(gitCommentedMessage);
      expect(result.valid).toBe(true);
      expect(result.parsed?.header).toBe('feat(domain): add money value object');
    });
  });

  describe('Invalid Commit Messages', () => {
    it('rejects empty commit message', () => {
      expect(validateCommitMessage('').valid).toBe(false);
      expect(validateCommitMessage('   \n\n  ').valid).toBe(false);
      expect(validateCommitMessage('# only comments\n# nothing else').valid).toBe(false);
    });

    it('rejects missing type prefix', () => {
      const result = validateCommitMessage('(calc-engine): add calculation logic');
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('does not match conventional commit format')),
      ).toBe(true);
    });

    it('rejects unapproved commit types', () => {
      const result = validateCommitMessage('wip(calc-engine): work in progress');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid commit type "wip"'))).toBe(true);

      const result2 = validateCommitMessage('feature(domain): add money');
      expect(result2.valid).toBe(false);
      expect(result2.errors.some((e) => e.includes('Invalid commit type "feature"'))).toBe(true);
    });

    it('rejects missing colon or space after colon', () => {
      const missingColon = validateCommitMessage('feat(calc-engine) add calculation');
      expect(missingColon.valid).toBe(false);

      const missingSpace = validateCommitMessage('feat(calc-engine):add calculation');
      expect(missingSpace.valid).toBe(false);
    });

    it('rejects empty descriptions', () => {
      const result = validateCommitMessage('feat(calc-engine):   ');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Commit description must not be empty'))).toBe(
        true,
      );
    });

    it('rejects description ending with a period', () => {
      const result = validateCommitMessage('fix(payments): prevent duplicate capture.');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('must not end with a period'))).toBe(true);
    });

    it('rejects header exceeding 100 characters', () => {
      const longHeader =
        'feat(calc-engine): this is an excessively long commit header description that goes well beyond one hundred characters in total length';
      const result = validateCommitMessage(longHeader);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('exceeds maximum length of 100 characters')),
      ).toBe(true);
    });

    it('rejects multiline message where second line is not blank', () => {
      const noBlankLine = `feat(rules): add rule pack schema
Line 2 without blank separation
Line 3 details`;

      const result = validateCommitMessage(noBlankLine);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('Second line of commit message must be blank')),
      ).toBe(true);
    });
  });

  describe('Zero SHA Detection Helper (isZeroSha)', () => {
    it('identifies 40-character all-zero SHA from git push event', () => {
      expect(isZeroSha('0000000000000000000000000000000000000000')).toBe(true);
      expect(isZeroSha('0000000')).toBe(true);
      expect(isZeroSha('')).toBe(true);
      expect(isZeroSha(null)).toBe(true);
      expect(isZeroSha(undefined)).toBe(true);
    });

    it('does not treat valid commit SHAs as zero SHA', () => {
      expect(isZeroSha('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')).toBe(false);
      expect(isZeroSha('0000000000000000000000000000000000000001')).toBe(false);
      expect(isZeroSha('main')).toBe(false);
      expect(isZeroSha('HEAD')).toBe(false);
    });
  });

  describe('Commit List Validation (validateCommitList)', () => {
    it('validates a list of valid commits', () => {
      const commits = [
        { hash: '1111111', subject: 'feat(domain): add money', message: 'feat(domain): add money' },
        { hash: '2222222', subject: 'fix(calc): fix tax', message: 'fix(calc): fix tax' },
      ];
      const result = validateCommitList(commits, { silent: true });
      expect(result.success).toBe(true);
      expect(result.total).toBe(2);
      expect(result.validCount).toBe(2);
      expect(result.invalidCount).toBe(0);
    });

    it('identifies and reports invalid commits with hash and subject', () => {
      const commits = [
        { hash: '1111111', subject: 'feat(domain): add money', message: 'feat(domain): add money' },
        { hash: '2222222', subject: 'bad commit message', message: 'bad commit message' },
        { hash: '3333333', subject: 'fix(calc): fix tax', message: 'fix(calc): fix tax' },
      ];
      const result = validateCommitList(commits, { silent: true });
      expect(result.success).toBe(false);
      expect(result.total).toBe(3);
      expect(result.validCount).toBe(2);
      expect(result.invalidCount).toBe(1);
      expect(result.invalidCommits[0].hash).toBe('2222222');
      expect(result.invalidCommits[0].subject).toBe('bad commit message');
      expect(result.invalidCommits[0].result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Commit Range Validation (real git operations)', { timeout: 30000 }, () => {
    let testRepoDir: string;

    beforeAll(() => {
      testRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimphy-git-test-'));
      execSync('git init -b main', { cwd: testRepoDir, stdio: 'ignore' });
      execSync('git config user.email "ci-test@nimphy.local"', {
        cwd: testRepoDir,
        stdio: 'ignore',
      });
      execSync('git config user.name "CI Test Runner"', { cwd: testRepoDir, stdio: 'ignore' });
      execSync('git config commit.gpgsign false', { cwd: testRepoDir, stdio: 'ignore' });

      // Create an initial commit so the repository has a root commit
      fs.writeFileSync(path.join(testRepoDir, 'init.txt'), 'initial');
      execSync('git add init.txt', { cwd: testRepoDir, stdio: 'ignore' });
      execSync('git commit -m "chore(root): initialize test repository"', {
        cwd: testRepoDir,
        stdio: 'ignore',
      });
    });

    afterAll(() => {
      try {
        fs.rmSync(testRepoDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    });

    it('retrieves commits in a range directly via getCommitsInRange', () => {
      const { commits, range } = getCommitsInRange({
        range: '-1 HEAD',
        cwd: testRepoDir,
      });
      expect(Array.isArray(commits)).toBe(true);
      expect(commits.length).toBe(1);
      expect(range).toBe('-1 HEAD');
      expect(commits[0]).toHaveProperty('hash');
      expect(commits[0]).toHaveProperty('subject');
      expect(commits[0]).toHaveProperty('message');
    });

    it('validates a valid multi-commit range', () => {
      const base = execSync('git rev-parse HEAD', { cwd: testRepoDir, encoding: 'utf8' }).trim();

      // Create first valid commit
      fs.writeFileSync(path.join(testRepoDir, 'file1.txt'), 'content 1');
      execSync('git add file1.txt', { cwd: testRepoDir, stdio: 'ignore' });
      execSync('git commit -m "feat(domain): add initial domain models"', {
        cwd: testRepoDir,
        stdio: 'ignore',
      });

      // Create second valid commit
      fs.writeFileSync(path.join(testRepoDir, 'file2.txt'), 'content 2');
      execSync('git add file2.txt', { cwd: testRepoDir, stdio: 'ignore' });
      execSync('git commit -m "fix(calc-engine): fix break-even rounding"', {
        cwd: testRepoDir,
        stdio: 'ignore',
      });

      const result = validateCommitRange({
        from: base,
        to: 'HEAD',
        cwd: testRepoDir,
        silent: true,
      });

      expect(result.success).toBe(true);
      expect(result.total).toBe(2);
      expect(result.validCount).toBe(2);
      expect(result.invalidCount).toBe(0);
    });

    it('rejects an invalid earlier commit in a multi-commit range', () => {
      const base = execSync('git rev-parse HEAD', { cwd: testRepoDir, encoding: 'utf8' }).trim();

      // Create an invalid commit first
      fs.writeFileSync(path.join(testRepoDir, 'file3.txt'), 'content 3');
      execSync('git add file3.txt', { cwd: testRepoDir, stdio: 'ignore' });
      execSync('git commit -m "unformatted bad commit message without type"', {
        cwd: testRepoDir,
        stdio: 'ignore',
      });

      // Create a valid commit on top
      fs.writeFileSync(path.join(testRepoDir, 'file4.txt'), 'content 4');
      execSync('git add file4.txt', { cwd: testRepoDir, stdio: 'ignore' });
      execSync('git commit -m "docs(architecture): clarify boundary rules"', {
        cwd: testRepoDir,
        stdio: 'ignore',
      });

      const result = validateCommitRange({
        from: base,
        to: 'HEAD',
        cwd: testRepoDir,
        silent: true,
      });

      expect(result.success).toBe(false);
      expect(result.total).toBe(2);
      expect(result.validCount).toBe(1);
      expect(result.invalidCount).toBe(1);
      expect(result.invalidCommits[0].subject).toBe('unformatted bad commit message without type');
    });

    it('handles mixed valid and invalid commits in a range and prints details', () => {
      const base = execSync('git rev-parse HEAD', { cwd: testRepoDir, encoding: 'utf8' }).trim();

      // Commit 1: valid
      fs.writeFileSync(path.join(testRepoDir, 'mix1.txt'), 'mix 1');
      execSync('git add mix1.txt', { cwd: testRepoDir, stdio: 'ignore' });
      execSync('git commit -m "feat(web): add disclaimer banner component"', {
        cwd: testRepoDir,
        stdio: 'ignore',
      });

      // Commit 2: invalid (bad type 'wip')
      fs.writeFileSync(path.join(testRepoDir, 'mix2.txt'), 'mix 2');
      execSync('git add mix2.txt', { cwd: testRepoDir, stdio: 'ignore' });
      execSync('git commit -m "wip(web): temporary work in progress"', {
        cwd: testRepoDir,
        stdio: 'ignore',
      });

      // Commit 3: valid
      fs.writeFileSync(path.join(testRepoDir, 'mix3.txt'), 'mix 3');
      execSync('git add mix3.txt', { cwd: testRepoDir, stdio: 'ignore' });
      execSync('git commit -m "refactor(web): clean up layout exports"', {
        cwd: testRepoDir,
        stdio: 'ignore',
      });

      const result = validateCommitRange({
        from: base,
        to: 'HEAD',
        cwd: testRepoDir,
        silent: true,
      });

      expect(result.success).toBe(false);
      expect(result.total).toBe(3);
      expect(result.validCount).toBe(2);
      expect(result.invalidCount).toBe(1);
      expect(result.invalidCommits[0].subject).toBe('wip(web): temporary work in progress');
    });

    it('handles empty commit ranges gracefully without errors', () => {
      const currentHead = execSync('git rev-parse HEAD', {
        cwd: testRepoDir,
        encoding: 'utf8',
      }).trim();
      const result = validateCommitRange({
        from: currentHead,
        to: currentHead,
        cwd: testRepoDir,
        silent: true,
      });

      expect(result.success).toBe(true);
      expect(result.total).toBe(0);
      expect(result.skipped).toBe(true);
    });

    it('safely handles new-branch push with all-zero before SHA', () => {
      const result = validateCommitRange({
        from: '0000000000000000000000000000000000000000',
        to: 'HEAD',
        cwd: testRepoDir,
        silent: true,
      });

      // Doesn't crash with invalid rev range error; inspects single HEAD commit
      expect(result.total).toBe(1);
      expect(result.success).toBe(true);
    });

    it('explicitly excludes merge commits from conventional commit validation', () => {
      const base = execSync('git rev-parse HEAD', { cwd: testRepoDir, encoding: 'utf8' }).trim();

      // 1. Create a separate feature branch
      execSync('git checkout -b temp-feature', { cwd: testRepoDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(testRepoDir, 'feature.txt'), 'feature content');
      execSync('git add feature.txt', { cwd: testRepoDir, stdio: 'ignore' });
      execSync('git commit -m "feat(payments): add paypal capture interface"', {
        cwd: testRepoDir,
        stdio: 'ignore',
      });

      // 2. Switch back to main and create a merge commit (non-fast-forward)
      execSync('git checkout main', { cwd: testRepoDir, stdio: 'ignore' });
      // Merge commit message is machine generated: "Merge branch 'temp-feature' into main"
      execSync('git merge --no-ff temp-feature -m "Merge branch temp-feature into main"', {
        cwd: testRepoDir,
        stdio: 'ignore',
      });

      // 3. Inspect commits between base and HEAD
      // With --no-merges, the merge commit "Merge branch temp-feature into main" is excluded,
      // and only the feature commit "feat(payments): add paypal capture interface" is evaluated.
      const result = validateCommitRange({
        from: base,
        to: 'HEAD',
        cwd: testRepoDir,
        silent: true,
      });

      expect(result.success).toBe(true);
      expect(result.total).toBe(1);
      const evaluatedSubjects = result.validCommits?.map((c) => c.subject) || [];
      expect(evaluatedSubjects.some((s) => s.startsWith('Merge branch'))).toBe(false);
      expect(evaluatedSubjects).toContain('feat(payments): add paypal capture interface');
      expect(result.invalidCommits?.some((c) => c.subject.startsWith('Merge branch'))).toBe(false);
    });
  });
});
