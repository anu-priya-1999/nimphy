import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Configures local Git hooks path to .githooks in a cross-platform manner.
 *
 * Requirements satisfied:
 * - Uses `git config --local core.hooksPath .githooks`
 * - Strictly avoids altering global Git configuration
 * - Gracefully handles missing Git or non-Git directories with useful errors
 * - Ensures hooks have executable permissions on POSIX systems
 * - Verifies the configured setting matches expectations
 *
 * @param {object} options
 * @param {string} [options.cwd=process.cwd()] - Working directory
 * @param {boolean} [options.silent=false] - Suppress console output
 * @returns {{ success: boolean, hooksPath?: string, error?: string }}
 */
export function setupHooks(options = {}) {
  const cwd = options.cwd || process.cwd();
  const silent = Boolean(options.silent);

  // 1. Verify Git executable availability
  try {
    execSync('git --version', { stdio: 'ignore', cwd });
  } catch {
    const error =
      'Git is not installed or not available in the system PATH. Please install Git to configure repository hooks.';
    if (!silent) {
      console.error(`✗ ${error}`);
    }
    return { success: false, error };
  }

  // 2. Verify current directory is inside a Git repository
  try {
    const isGit = execSync('git rev-parse --is-inside-work-tree', {
      encoding: 'utf8',
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (isGit !== 'true') {
      throw new Error('Not inside git work tree');
    }
  } catch {
    const error =
      'Current directory is not a Git repository work tree. Run "git init" or clone a repository first.';
    if (!silent) {
      console.error(`✗ ${error}`);
    }
    return { success: false, error };
  }

  // 3. Verify .githooks directory existence
  const hooksDir = path.resolve(cwd, '.githooks');
  if (!fs.existsSync(hooksDir)) {
    const error = `The hooks directory was not found: ${hooksDir}`;
    if (!silent) {
      console.error(`✗ ${error}`);
    }
    return { success: false, error };
  }

  // 4. Configure local Git core.hooksPath strictly in local config
  try {
    execSync('git config --local core.hooksPath .githooks', { cwd });
  } catch (err) {
    const error = `Failed to configure git core.hooksPath: ${err.message}`;
    if (!silent) {
      console.error(`✗ ${error}`);
    }
    return { success: false, error };
  }

  // 5. Ensure hook scripts have executable permissions on POSIX systems
  const commitMsgHook = path.join(hooksDir, 'commit-msg');
  if (fs.existsSync(commitMsgHook)) {
    try {
      fs.chmodSync(commitMsgHook, 0o755);
    } catch {
      // Non-fatal on platforms or filesystems without POSIX permissions (e.g. Windows NTFS)
    }
  }

  // 6. Verify local configuration setting
  try {
    const configuredPath = execSync('git config --local --get core.hooksPath', {
      encoding: 'utf8',
      cwd,
    }).trim();

    if (configuredPath !== '.githooks') {
      const error = `Verification failed: expected core.hooksPath to be ".githooks", but found "${configuredPath}".`;
      if (!silent) {
        console.error(`✗ ${error}`);
      }
      return { success: false, error };
    }
  } catch (err) {
    const error = `Failed to read back local core.hooksPath: ${err.message}`;
    if (!silent) {
      console.error(`✗ ${error}`);
    }
    return { success: false, error };
  }

  if (!silent) {
    console.log('✓ Git hooks successfully configured: git config --local core.hooksPath .githooks');
  }

  return { success: true, hooksPath: '.githooks' };
}

// CLI entrypoint
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = setupHooks();
  process.exit(result.success ? 0 : 1);
}
