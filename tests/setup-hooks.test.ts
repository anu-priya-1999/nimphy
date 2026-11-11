import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupHooks } from '../scripts/setup-hooks.mjs';

describe('Git Hook Setup Tooling (setup-hooks)', { timeout: 30000 }, () => {
  let tempDir: string;
  let nonGitDir: string;

  beforeAll(() => {
    // 1. Create a non-git directory for error handling tests
    nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimphy-nongit-'));

    // 2. Create a temporary git repo to test setupHooks functionality
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimphy-hooks-test-'));
    execSync('git init', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.email "test@nimphy.local"', { cwd: tempDir, stdio: 'ignore' });
    execSync('git config user.name "Nimphy Hook Tester"', { cwd: tempDir, stdio: 'ignore' });
  });

  afterAll(() => {
    try {
      fs.rmSync(nonGitDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('fails gracefully when run outside a git repository', () => {
    const result = setupHooks({ cwd: nonGitDir, silent: true });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a Git repository');
  });

  it('fails gracefully when .githooks directory does not exist', () => {
    // tempDir is a git repo, but has no .githooks folder yet
    const result = setupHooks({ cwd: tempDir, silent: true });
    expect(result.success).toBe(false);
    expect(result.error).toContain('The hooks directory was not found');
  });

  it('configures git config --local core.hooksPath when .githooks exists', () => {
    // Create .githooks directory and a dummy commit-msg file
    const hooksDir = path.join(tempDir, '.githooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, 'commit-msg'), '#!/bin/sh\nexit 0\n');

    const result = setupHooks({ cwd: tempDir, silent: true });
    expect(result.success).toBe(true);
    expect(result.hooksPath).toBe('.githooks');

    // Verify local config
    const configured = execSync('git config --local --get core.hooksPath', {
      cwd: tempDir,
      encoding: 'utf8',
    }).trim();
    expect(configured).toBe('.githooks');
  });

  it('verifies that current repository has core.hooksPath set to .githooks', () => {
    const configured = execSync('git config --local --get core.hooksPath', {
      encoding: 'utf8',
    }).trim();
    expect(configured).toBe('.githooks');
  });
});
