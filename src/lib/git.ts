/**
 * Git utility functions for workspace analysis
 *
 * @module @dcyfr/ai-cli/lib/git
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Get files changed since last commit (unstaged + staged)
 */
export async function getChangedFiles(cwd: string): Promise<string[]> {
  try {
    // Get both staged and unstaged changes
    const { stdout: diffStdout } = await execFileAsync('git', ['diff', '--name-only'], { cwd });
    const { stdout: stagedStdout } = await execFileAsync(
      'git',
      ['diff', '--cached', '--name-only'],
      { cwd },
    );

    const files = new Set([
      ...diffStdout.trim().split('\n').filter(Boolean),
      ...stagedStdout.trim().split('\n').filter(Boolean),
    ]);

    return Array.from(files);
  } catch {
    return [];
  }
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
    return stdout.trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Get the latest commit hash (short)
 */
export async function getLatestCommit(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], { cwd });
    return stdout.trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Check if a path is a git repository
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd });
    return true;
  } catch {
    return false;
  }
}
