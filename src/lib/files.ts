/**
 * File discovery and I/O utilities
 *
 * @module @dcyfr/ai-cli/lib/files
 */

import { readdir, readFile, access } from 'fs/promises';
import { join, relative, extname } from 'path';

/**
 * Default ignore patterns for file discovery
 */
const DEFAULT_IGNORE = new Set([
  'node_modules',
  '.next',
  '.git',
  '.dcyfr',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.vercel',
  '__pycache__',
]);

/**
 * Options for file discovery
 */
export interface DiscoverOptions {
  /** File extensions to include (e.g., ['.ts', '.tsx']) */
  extensions?: string[];
  /** Additional directories to ignore */
  ignore?: string[];
  /** Pattern to match in file path */
  pathPattern?: RegExp;
  /** Maximum depth to recurse */
  maxDepth?: number;
}

/**
 * Check if an entry should be included in file discovery
 */
function shouldIncludeEntry(
  entryName: string,
  ignoreSet: Set<string>,
): boolean {
  if (ignoreSet.has(entryName)) return false;
  if (entryName.startsWith('.') && entryName !== '.') return false;
  return true;
}

/**
 * Check if a file matches discovery criteria
 */
function matchesFileCriteria(
  fullPath: string,
  fileName: string,
  extensions: string[] | undefined,
  pathPattern: RegExp | undefined,
): boolean {
  if (extensions && !extensions.includes(extname(fileName))) return false;
  if (pathPattern && !pathPattern.test(fullPath)) return false;
  return true;
}

/**
 * Walk a single directory level, recursing into subdirectories.
 * Mutates `files` array in place.
 */
async function walkDir(
  dir: string,
  depth: number,
  maxDepth: number,
  ignoreSet: Set<string>,
  extensions: string[] | undefined,
  pathPattern: RegExp | undefined,
  files: string[],
): Promise<void> {
  if (depth > maxDepth) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // Skip unreadable directories
  }

  for (const entry of entries) {
    if (!shouldIncludeEntry(entry.name, ignoreSet)) continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await walkDir(fullPath, depth + 1, maxDepth, ignoreSet, extensions, pathPattern, files);
    } else if (entry.isFile()) {
      if (matchesFileCriteria(fullPath, entry.name, extensions, pathPattern)) {
        files.push(fullPath);
      }
    }
  }
}

/**
 * Recursively discover files matching criteria
 */
export async function discoverFiles(
  root: string,
  options: DiscoverOptions = {},
): Promise<string[]> {
  const { extensions, ignore = [], pathPattern, maxDepth = 20 } = options;
  const ignoreSet = new Set([...DEFAULT_IGNORE, ...ignore]);
  const files: string[] = [];
  await walkDir(root, 0, maxDepth, ignoreSet, extensions, pathPattern, files);
  return files;
}

/**
 * Read a file's content, returning null if it doesn't exist
 */
export async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Check if a path exists
 */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get relative path from workspace root
 */
export function relativePath(workspaceRoot: string, filePath: string): string {
  return relative(workspaceRoot, filePath);
}

/**
 * List project directories in the workspace
 */
export async function listProjects(workspaceRoot: string): Promise<string[]> {
  const entries = await readdir(workspaceRoot, { withFileTypes: true });
  const projects: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (DEFAULT_IGNORE.has(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;

    // Check if it has a package.json (i.e., it's a project)
    const pkgPath = join(workspaceRoot, entry.name, 'package.json');
    if (await pathExists(pkgPath)) {
      projects.push(entry.name);
    }
  }

  return projects;
}

/**
 * Get the lines of a file
 */
export function getLines(content: string): string[] {
  return content.split('\n');
}
