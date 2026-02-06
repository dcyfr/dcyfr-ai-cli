/**
 * License Headers Scanner
 *
 * Validates that source files have MIT license headers.
 *
 * @module @dcyfr/ai-cli/scanners/license-headers
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { discoverFiles, relativePath } from '@/lib/files.js';
import type { Scanner, ScanContext, ScanResult, ScanViolation, FixResult } from './types.js';

/**
 * MIT license header to prepend to source files
 */
const LICENSE_HEADER = `/**
 * Copyright (c) ${new Date().getFullYear()} DCYFR
 * Licensed under the MIT License. See LICENSE for details.
 */

`;

const LICENSE_PATTERNS = [/Copyright \(c\).*DCYFR/i, /Licensed under the MIT License/i];

export const licenseHeadersScanner: Scanner = {
  id: 'license-headers',
  name: 'License Header Compliance',
  description: 'Validates source files have MIT license headers',
  category: 'governance',

  async scan(context: ScanContext): Promise<ScanResult> {
    const start = Date.now();

    // Discover all source files across all projects
    const files =
      context.files ??
      (await discoverFiles(context.workspaceRoot, {
        extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs'],
        ignore: ['__tests__', '*.test.*', '*.spec.*', 'node_modules', 'dist', '.next'],
      }));

    const violations: ScanViolation[] = [];
    let filesChecked = 0;
    let filesWithHeader = 0;

    for (const filePath of files) {
      let content: string;
      try {
        content = await readFile(filePath, 'utf-8');
      } catch {
        continue;
      }

      filesChecked++;
      const relPath = relativePath(context.workspaceRoot, filePath);

      // Check the first 10 lines for a license header
      const head = content.split('\n').slice(0, 10).join('\n');
      const hasLicense = LICENSE_PATTERNS.some((p) => p.test(head));

      if (hasLicense) {
        filesWithHeader++;
      } else {
        // Skip generated files, config files, etc.
        if (
          relPath.includes('.config.') ||
          relPath.includes('tailwind') ||
          relPath.includes('postcss') ||
          relPath.includes('next.config') ||
          relPath.includes('eslint') ||
          relPath.includes('prettier') ||
          relPath.includes('vitest.config')
        ) {
          filesChecked--; // Don't count config files
          continue;
        }

        violations.push({
          id: 'missing-license-header',
          severity: 'warning',
          message: `Missing license header: ${relPath}`,
          file: relPath,
          line: 1,
          fix: 'Add MIT license header comment block',
          autoFixable: true,
        });
      }
    }

    const compliance = filesChecked > 0 ? filesWithHeader / filesChecked : 1;
    const status = compliance >= 0.95 ? 'pass' : compliance >= 0.8 ? 'warn' : 'fail';

    return {
      scanner: 'license-headers',
      status,
      violations,
      warnings: [],
      metrics: {
        compliance: Math.round(compliance * 1000) / 10,
        filesChecked,
        filesWithHeader,
        filesMissing: violations.length,
      },
      duration: Date.now() - start,
      timestamp: new Date().toISOString(),
      summary: `${filesWithHeader}/${filesChecked} files have license headers (${(compliance * 100).toFixed(1)}%)`,
    };
  },

  async fix(context: ScanContext, violations: ScanViolation[]): Promise<FixResult> {
    const filesModified: string[] = [];
    const failures: Array<{ file: string; reason: string }> = [];

    for (const violation of violations) {
      if (!violation.file) continue;

      const fullPath = join(context.workspaceRoot, violation.file);

      try {
        const content = await readFile(fullPath, 'utf-8');

        // Skip if already has a license header (safety check)
        const head = content.split('\n').slice(0, 10).join('\n');
        if (LICENSE_PATTERNS.some((p) => p.test(head))) {
          continue;
        }

        // Handle shebang lines — insert after shebang
        let newContent: string;
        if (content.startsWith('#!')) {
          const firstNewline = content.indexOf('\n');
          const shebang = content.slice(0, firstNewline + 1);
          const rest = content.slice(firstNewline + 1);
          newContent = shebang + '\n' + LICENSE_HEADER + rest;
        } else {
          newContent = LICENSE_HEADER + content;
        }

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
      scanner: 'license-headers',
      fixesApplied: filesModified.length,
      filesModified,
      failures,
    };
  },
};
