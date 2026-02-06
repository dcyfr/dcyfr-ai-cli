/**
 * Test Data Guardian Scanner
 *
 * Detects production data leakage in test files — real API keys,
 * credentials, emails, and other sensitive data that shouldn't be
 * in source control.
 *
 * @module @dcyfr/ai-cli/scanners/test-data-guardian
 */

import { readFile } from 'fs/promises';
import { discoverFiles, relativePath } from '@/lib/files.js';
import type { Scanner, ScanContext, ScanResult, ScanViolation } from './types.js';

/**
 * Patterns that indicate real credentials in test files
 */
const SENSITIVE_PATTERNS = [
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/g,
  },
  {
    name: 'Private Key',
    pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,
  },
  {
    name: 'Generic API Key',
    pattern: /api[_-]?key['"]?\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi,
  },
  {
    name: 'Generic Secret',
    pattern: /secret[_-]?key['"]?\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi,
  },
  {
    name: 'JWT Token',
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
  },
  {
    name: 'Real Email',
    pattern:
      /[a-zA-Z0-9._%+-]+@(?!example\.com|test\.com|mock\.com|placeholder\.com)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  },
];

export const testDataGuardianScanner: Scanner = {
  id: 'test-data-guardian',
  name: 'Test Data Guardian',
  description: 'Detects production data leakage in test files',
  category: 'security',

  async scan(context: ScanContext): Promise<ScanResult> {
    const start = Date.now();

    // Find all test files
    const files =
      context.files ??
      (await discoverFiles(context.workspaceRoot, {
        extensions: ['.ts', '.tsx', '.js', '.mjs'],
        pathPattern: /\.(test|spec)\.(ts|tsx|js|mjs)$/,
      }));

    const violations: ScanViolation[] = [];
    let filesChecked = 0;

    for (const filePath of files) {
      let content: string;
      try {
        content = await readFile(filePath, 'utf-8');
      } catch {
        continue;
      }

      filesChecked++;
      const relPath = relativePath(context.workspaceRoot, filePath);
      const lines = content.split('\n');

      for (const { name, pattern } of SENSITIVE_PATTERNS) {
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx]!;
          const lineRegex = new RegExp(pattern.source, pattern.flags);
          let match;

          while ((match = lineRegex.exec(line)) !== null) {
            // Don't flag things in comments explaining the pattern
            if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;

            violations.push({
              id: `sensitive-${name.toLowerCase().replace(/\s+/g, '-')}`,
              severity: 'error',
              message: `Potential ${name} found in test file: ${relPath}:${lineIdx + 1}`,
              file: relPath,
              line: lineIdx + 1,
              column: match.index,
              fix: `Replace with mock/fake data (e.g., 'test-api-key-123')`,
              autoFixable: false,
            });
          }
        }
      }
    }

    const status = violations.length === 0 ? 'pass' : 'fail';

    return {
      scanner: 'test-data-guardian',
      status,
      violations,
      warnings: [],
      metrics: {
        filesChecked,
        sensitiveFindings: violations.length,
      },
      duration: Date.now() - start,
      timestamp: new Date().toISOString(),
      summary:
        violations.length === 0
          ? `${filesChecked} test files clean — no production data found`
          : `${violations.length} potential data leaks found in ${filesChecked} test files`,
    };
  },
};
