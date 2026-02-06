/**
 * Design Token Scanner
 *
 * Validates SPACING, TYPOGRAPHY, and COLOR token usage in dcyfr-labs.
 * Wraps the enforcement rules from @dcyfr/workspace-agents.
 *
 * @module @dcyfr/ai-cli/scanners/design-tokens
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { discoverFiles, relativePath } from '@/lib/files.js';
import type { Scanner, ScanContext, ScanResult, ScanViolation } from './types.js';

/**
 * Design token enforcement rules (inlined from @dcyfr/workspace-agents)
 */
interface TokenRule {
  id: string;
  name: string;
  pattern: RegExp;
  severity: 'error' | 'warning';
  fix: string;
}

const SPACING_RULES: TokenRule[] = [
  {
    id: 'spacing-hardcoded-vertical',
    name: 'Hardcoded Vertical Spacing',
    pattern: /space-y-\d+/g,
    severity: 'error',
    fix: 'Use SPACING.section, SPACING.content, or SPACING.compact',
  },
  {
    id: 'spacing-hardcoded-gap',
    name: 'Hardcoded Gap',
    pattern: /(?<![a-z-])gap-\d+(?![a-z])/g,
    severity: 'error',
    fix: 'Use SPACING tokens or custom gap classes',
  },
  {
    id: 'spacing-hardcoded-margin',
    name: 'Hardcoded Margin',
    pattern: /(?<![a-z-])(m|mt|mb|ml|mr|mx|my)-\d+(?![a-z])/g,
    severity: 'warning',
    fix: 'Use SPACING tokens for margins',
  },
];

const TYPOGRAPHY_RULES: TokenRule[] = [
  {
    id: 'typography-hardcoded-size',
    name: 'Hardcoded Text Size',
    pattern: /text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)/g,
    severity: 'error',
    fix: 'Use TYPOGRAPHY.h1, TYPOGRAPHY.h2, TYPOGRAPHY.body, etc.',
  },
  {
    id: 'typography-hardcoded-weight',
    name: 'Hardcoded Font Weight',
    pattern: /font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)/g,
    severity: 'error',
    fix: 'Use TYPOGRAPHY tokens that include weight',
  },
];

const COLOR_RULES: TokenRule[] = [
  {
    id: 'color-hardcoded-bg',
    name: 'Hardcoded Background Color',
    pattern:
      /bg-(white|black|gray|red|blue|green|yellow|purple|pink|orange|indigo|teal|cyan)-\d+/g,
    severity: 'error',
    fix: 'Use bg-background, bg-card, bg-primary, etc.',
  },
  {
    id: 'color-hardcoded-text',
    name: 'Hardcoded Text Color',
    pattern:
      /text-(white|black|gray|red|blue|green|yellow|purple|pink|orange|indigo|teal|cyan)-\d+/g,
    severity: 'error',
    fix: 'Use text-foreground, text-primary, text-muted-foreground, etc.',
  },
  {
    id: 'color-hardcoded-border',
    name: 'Hardcoded Border Color',
    pattern:
      /border-(white|black|gray|red|blue|green|yellow|purple|pink|orange|indigo|teal|cyan)-\d+/g,
    severity: 'error',
    fix: 'Use border-border, border-primary/20, etc.',
  },
];

const ALL_TOKEN_RULES: TokenRule[] = [...SPACING_RULES, ...TYPOGRAPHY_RULES, ...COLOR_RULES];

/**
 * Design token compliance scanner
 */
export const designTokensScanner: Scanner = {
  id: 'design-tokens',
  name: 'Design Token Compliance',
  description: 'Validates SPACING, TYPOGRAPHY, and COLOR token usage across components',
  category: 'compliance',
  projects: ['dcyfr-labs'],

  async scan(context: ScanContext): Promise<ScanResult> {
    const start = Date.now();
    const projectRoot = context.project
      ? join(context.workspaceRoot, context.project)
      : join(context.workspaceRoot, 'dcyfr-labs');

    // Discover component/page files
    const files =
      context.files ??
      (await discoverFiles(join(projectRoot, 'src'), {
        extensions: ['.tsx', '.ts', '.jsx'],
        ignore: ['__tests__', 'tests', '*.test.*', '*.spec.*'],
      }));

    const violations: ScanViolation[] = [];
    const warnings: ScanViolation[] = [];
    let totalLines = 0;
    let filesScanned = 0;

    for (const filePath of files) {
      let content: string;
      try {
        content = await readFile(filePath, 'utf-8');
      } catch {
        continue;
      }

      filesScanned++;
      const lines = content.split('\n');
      totalLines += lines.length;

      // Skip design token definition files
      const relPath = relativePath(context.workspaceRoot, filePath);
      if (relPath.includes('design-tokens') || relPath.includes('tailwind.config')) continue;

      for (const rule of ALL_TOKEN_RULES) {
        // Reset regex lastIndex for each file
        rule.pattern.lastIndex = 0;

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx]!;
          // Skip comment lines
          if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;

          let match;
          // Create a new regex for each line to avoid lastIndex issues
          const lineRegex = new RegExp(rule.pattern.source, rule.pattern.flags);
          while ((match = lineRegex.exec(line)) !== null) {
            const violation: ScanViolation = {
              id: rule.id,
              severity: rule.severity === 'error' ? 'error' : 'warning',
              message: `${rule.name}: '${match[0]}' — ${rule.fix}`,
              file: relPath,
              line: lineIdx + 1,
              column: match.index,
              fix: rule.fix,
              autoFixable: false,
            };

            if (rule.severity === 'error') {
              violations.push(violation);
            } else {
              warnings.push(violation);
            }
          }
        }
      }
    }

    // Calculate compliance: ratio of clean files
    const filesWithViolations = new Set(violations.map((v) => v.file)).size;
    const compliance = filesScanned > 0 ? (filesScanned - filesWithViolations) / filesScanned : 1;

    const status = compliance >= 0.95 ? 'pass' : compliance >= 0.9 ? 'warn' : 'fail';

    return {
      scanner: 'design-tokens',
      status,
      violations,
      warnings,
      metrics: {
        compliance: Math.round(compliance * 1000) / 10,
        filesScanned,
        totalViolations: violations.length,
        totalWarnings: warnings.length,
      },
      duration: Date.now() - start,
      timestamp: new Date().toISOString(),
      summary: `${(compliance * 100).toFixed(1)}% compliance (${violations.length} errors, ${warnings.length} warnings in ${filesScanned} files)`,
    };
  },
};
