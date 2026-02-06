/**
 * TLP Headers Scanner
 *
 * Validates that documentation files have TLP (Traffic Light Protocol)
 * classification headers as required by workspace governance.
 *
 * @module @dcyfr/ai-cli/scanners/tlp-headers
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { discoverFiles, relativePath } from '@/lib/files.js';
import type { Scanner, ScanContext, ScanResult, ScanViolation, FixResult } from './types.js';

const TLP_PATTERN = /<!--\s*TLP:(CLEAR|GREEN|AMBER|RED)/;
/**
 * Files that are exempt from TLP requirements
 */
const EXEMPT_FILES = new Set([
  'README.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'LICENSE.md',
  'SPONSORS.md',
  'CHANGELOG.md',
  'CODE_OF_CONDUCT.md',
]);

export const tlpHeadersScanner: Scanner = {
  id: 'tlp-headers',
  name: 'TLP Classification',
  description: 'Validates documentation has Traffic Light Protocol classification headers',
  category: 'governance',

  async scan(context: ScanContext): Promise<ScanResult> {
    const start = Date.now();

    // Find all markdown files in docs/ directories
    const files =
      context.files ??
      (await discoverFiles(context.workspaceRoot, {
        extensions: ['.md'],
        pathPattern: /\/docs\//,
      }));

    const violations: ScanViolation[] = [];
    const warnings: ScanViolation[] = [];
    let filesChecked = 0;
    let filesWithTlp = 0;

    for (const filePath of files) {
      const relPath = relativePath(context.workspaceRoot, filePath);

      // Skip exempt files
      const fileName = relPath.split('/').pop() || '';
      if (EXEMPT_FILES.has(fileName)) continue;

      let content: string;
      try {
        content = await readFile(filePath, 'utf-8');
      } catch {
        continue;
      }

      filesChecked++;

      // Check for TLP header in the first 5 lines
      const head = content.split('\n').slice(0, 5).join('\n');
      const tlpMatch = TLP_PATTERN.exec(head);

      if (tlpMatch) {
        filesWithTlp++;
      } else {
        // Check if TLP exists anywhere in the file (misplaced)
        const bodyMatch = TLP_PATTERN.exec(content);
        if (bodyMatch) {
          warnings.push({
            id: 'tlp-misplaced',
            severity: 'warning',
            message: `TLP header found but not in first 5 lines: ${relPath}`,
            file: relPath,
            fix: 'Move TLP classification comment to the first line of the file',
          });
          filesWithTlp++; // Still counts as having TLP
        } else {
          violations.push({
            id: 'missing-tlp-header',
            severity: 'warning',
            message: `Missing TLP classification header: ${relPath}`,
            file: relPath,
            line: 1,
            fix: 'Add <!-- TLP:CLEAR --> or appropriate classification to line 1',
            autoFixable: true,
          });
        }
      }
    }

    const compliance = filesChecked > 0 ? filesWithTlp / filesChecked : 1;
    const status = compliance >= 0.9 ? 'pass' : compliance >= 0.7 ? 'warn' : 'fail';

    return {
      scanner: 'tlp-headers',
      status,
      violations,
      warnings,
      metrics: {
        compliance: Math.round(compliance * 1000) / 10,
        filesChecked,
        filesWithTlp,
        filesMissing: violations.length,
      },
      duration: Date.now() - start,
      timestamp: new Date().toISOString(),
      summary: `${filesWithTlp}/${filesChecked} docs have TLP headers (${(compliance * 100).toFixed(1)}%)`,
    };
  },

  async fix(context: ScanContext, violations: ScanViolation[]): Promise<FixResult> {
    const filesModified: string[] = [];
    const failures: Array<{ file: string; reason: string }> = [];

    /** Default TLP classification for auto-fix */
    const DEFAULT_TLP = '<!-- TLP:CLEAR -->\n';

    for (const violation of violations) {
      if (!violation.file) continue;

      const fullPath = join(context.workspaceRoot, violation.file);

      try {
        const content = await readFile(fullPath, 'utf-8');

        // Safety check — skip if TLP already present
        const head = content.split('\n').slice(0, 5).join('\n');
        if (TLP_PATTERN.test(head)) continue;

        // Prepend TLP header
        const newContent = DEFAULT_TLP + content;
        await writeFile(fullPath, newContent, 'utf-8');
        filesModified.push(violation.file);
      } catch (error) {
        failures.push({
          file: violation.file,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      scanner: 'tlp-headers',
      fixesApplied: filesModified.length,
      filesModified,
      failures,
    };
  },
};
