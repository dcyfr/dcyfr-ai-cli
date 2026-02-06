/**
 * PageLayout Scanner
 *
 * Validates that all page.tsx files use the PageLayout component.
 *
 * @module @dcyfr/ai-cli/scanners/pagelayout
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { discoverFiles, relativePath } from '@/lib/files.js';
import type { Scanner, ScanContext, ScanResult, ScanViolation } from './types.js';

/**
 * Allowed layout components (PageLayout + legitimate exceptions)
 */
const ALLOWED_LAYOUTS = ['PageLayout', 'ArticleLayout', 'ArchiveLayout', 'ErrorLayout'];

export const pageLayoutScanner: Scanner = {
  id: 'pagelayout',
  name: 'PageLayout Usage',
  description: 'Validates page components use the PageLayout system',
  category: 'compliance',
  projects: ['dcyfr-labs'],

  async scan(context: ScanContext): Promise<ScanResult> {
    const start = Date.now();
    const projectRoot = context.project
      ? join(context.workspaceRoot, context.project)
      : join(context.workspaceRoot, 'dcyfr-labs');

    // Find all page.tsx files
    const pageFiles = await discoverFiles(join(projectRoot, 'src', 'app'), {
      pathPattern: /page\.(tsx|jsx)$/,
    });

    const violations: ScanViolation[] = [];
    let pagesChecked = 0;
    let pagesWithLayout = 0;

    for (const filePath of pageFiles) {
      let content: string;
      try {
        content = await readFile(filePath, 'utf-8');
      } catch {
        continue;
      }

      pagesChecked++;
      const relPath = relativePath(context.workspaceRoot, filePath);

      // Check for any of the allowed layout components
      const hasLayout = ALLOWED_LAYOUTS.some(
        (layout) =>
          content.includes(`<${layout}`) ||
          content.includes(`import`) && content.includes(layout),
      );

      if (hasLayout) {
        pagesWithLayout++;
      } else {
        // Skip layout.tsx and not-found.tsx files
        if (relPath.includes('layout.tsx') || relPath.includes('not-found')) continue;

        violations.push({
          id: 'missing-pagelayout',
          severity: 'error',
          message: `Page does not use PageLayout: ${relPath}`,
          file: relPath,
          fix: `Wrap page content with <PageLayout layout="standard">...</PageLayout>`,
          autoFixable: false,
        });
      }
    }

    const usage = pagesChecked > 0 ? pagesWithLayout / pagesChecked : 1;
    const status = usage >= 0.9 ? 'pass' : usage >= 0.8 ? 'warn' : 'fail';

    return {
      scanner: 'pagelayout',
      status,
      violations,
      warnings: [],
      metrics: {
        usage: Math.round(usage * 1000) / 10,
        pagesChecked,
        pagesWithLayout,
        pagesWithout: violations.length,
      },
      duration: Date.now() - start,
      timestamp: new Date().toISOString(),
      summary: `${pagesWithLayout}/${pagesChecked} pages use PageLayout (${(usage * 100).toFixed(1)}%)`,
    };
  },
};
