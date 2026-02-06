/**
 * Workspace root detection
 *
 * Finds the DCYFR workspace root by looking for workspace markers.
 *
 * @module @dcyfr/ai-cli/lib/workspace
 */

import { join, resolve } from 'path';
import { pathExists } from './files.js';

/**
 * Files that indicate a workspace root
 */
const WORKSPACE_MARKERS = [
  'workspace.config.json', // DCYFR workspace marker
  'openspec', // OpenSpec directory
];

/**
 * Detect the workspace root directory.
 *
 * Resolution order:
 * 1. DCYFR_WORKSPACE env var
 * 2. Walk up from cwd looking for workspace markers
 * 3. Fall back to cwd
 */
export async function findWorkspaceRoot(): Promise<string> {
  // 1. Environment variable override
  const envRoot = process.env['DCYFR_WORKSPACE'];
  if (envRoot) {
    return resolve(envRoot);
  }

  // 2. Walk up from cwd
  let dir = process.cwd();
  const root = '/';

  for (let i = 0; i < 10; i++) {
    for (const marker of WORKSPACE_MARKERS) {
      if (await pathExists(join(dir, marker))) {
        return dir;
      }
    }

    const parent = resolve(dir, '..');
    if (parent === dir || parent === root) break;
    dir = parent;
  }

  // 3. Fallback to cwd
  return process.cwd();
}
