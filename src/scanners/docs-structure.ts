/**
 * Docs Structure Scanner
 *
 * Validates workspace documentation organization policy:
 * - No stray .md files in repo roots (except allowed ones)
 * - Proper docs/ subdirectory usage
 * - docs/README.md index exists
 *
 * @module @dcyfr/ai-cli/scanners/docs-structure
 */

import { mkdir, readdir, rename } from 'fs/promises';
import { join, dirname } from 'path';
import { pathExists, listProjects } from '@/lib/files.js';
import type { Scanner, ScanContext, ScanResult, ScanViolation, FixResult } from './types.js';

/**
 * Markdown files allowed in repository roots
 */
const ALLOWED_ROOT_MD = new Set([
  'README.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'LICENSE.md',
  'LICENSE',
  'SPONSORS.md',
  'CHANGELOG.md',
  'CODE_OF_CONDUCT.md',
  'CLAUDE.md',
]);

export const docsStructureScanner: Scanner = {
  id: 'docs-structure',
  name: 'Documentation Structure',
  description: 'Validates documentation organization policy (no stray docs in roots)',
  category: 'governance',

  async scan(context: ScanContext): Promise<ScanResult> {
    const start = Date.now();
    const violations: ScanViolation[] = [];
    const warnings: ScanViolation[] = [];

    // Check workspace root for stray .md files
    await checkRoot(context.workspaceRoot, '', violations, warnings);

    // Check each project root
    const projects = await listProjects(context.workspaceRoot);
    for (const project of projects) {
      await checkRoot(join(context.workspaceRoot, project), project, violations, warnings);
    }

    // Check if workspace docs/README.md index exists
    const docsIndex = join(context.workspaceRoot, 'docs', 'README.md');
    if (!(await pathExists(docsIndex))) {
      warnings.push({
        id: 'missing-docs-index',
        severity: 'warning',
        message: 'Missing docs/README.md index at workspace root',
        file: 'docs/README.md',
        fix: 'Create docs/README.md with an index of all documentation',
      });
    }

    const status = violations.length === 0 ? 'pass' : 'warn';

    return {
      scanner: 'docs-structure',
      status,
      violations,
      warnings,
      metrics: {
        strayFiles: violations.length,
        projectsChecked: projects.length + 1,
      },
      duration: Date.now() - start,
      timestamp: new Date().toISOString(),
      summary:
        violations.length === 0
          ? 'Documentation structure is clean'
          : `${violations.length} stray markdown files found in repository roots`,
    };
  },

  async fix(context: ScanContext, violations: ScanViolation[]): Promise<FixResult> {
    const filesModified: string[] = [];
    const failures: Array<{ file: string; reason: string }> = [];

    for (const violation of violations) {
      if (violation.id !== 'stray-root-doc' || !violation.file) continue;

      const sourcePath = join(context.workspaceRoot, violation.file);
      const targetDir = categorizeDoc(violation.file);
      const fileName = violation.file.split('/').pop() ?? violation.file;

      // Determine full target path
      const prefix = violation.file.includes('/') ? dirname(violation.file) : '';
      const docsDir = prefix ? join(context.workspaceRoot, prefix, 'docs', targetDir) : join(context.workspaceRoot, 'docs', targetDir);
      const targetPath = join(docsDir, fileName);

      try {
        // Create target directory
        await mkdir(docsDir, { recursive: true });

        // Don't overwrite existing files
        if (await pathExists(targetPath)) {
          failures.push({
            file: violation.file,
            reason: `Target already exists: ${targetPath}`,
          });
          continue;
        }

        // Move the file
        await rename(sourcePath, targetPath);
        filesModified.push(violation.file);
      } catch (error) {
        failures.push({
          file: violation.file,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      scanner: 'docs-structure',
      fixesApplied: filesModified.length,
      filesModified,
      failures,
    };
  },
};

async function checkRoot(
  rootDir: string,
  prefix: string,
  violations: ScanViolation[],
  _warnings: ScanViolation[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(rootDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    if (ALLOWED_ROOT_MD.has(entry)) continue;

    const relPath = prefix ? `${prefix}/${entry}` : entry;
    violations.push({
      id: 'stray-root-doc',
      severity: 'warning',
      message: `Stray markdown file in root: ${relPath} (should be in docs/)`,
      file: relPath,
      fix: `Move to ${prefix ? prefix + '/' : ''}docs/<category>/${entry}`,
      autoFixable: true,
    });
  }
}

/**
 * Categorize a stray document into a docs subdirectory based on filename
 */
function categorizeDoc(filePath: string): string {
  const name = (filePath.split('/').pop() ?? filePath).toLowerCase();

  if (name.includes('plan') || name.includes('implementation')) return 'plans';
  if (name.includes('review') || name.includes('audit')) return 'reviews';
  if (name.includes('report') || name.includes('session')) return 'reports';
  if (name.includes('architecture') || name.includes('adr')) return 'architecture';
  if (name.includes('security') || name.includes('compliance')) return 'audits';
  if (name.includes('decision') || name.includes('log')) return 'decisions';
  if (name.includes('investigation') || name.includes('analysis')) return 'investigations';
  if (name.includes('guide') || name.includes('tutorial') || name.includes('howto'))
    return 'guides';

  // Default catch-all
  return 'reports';
}
