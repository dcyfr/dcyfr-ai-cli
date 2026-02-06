/**
 * Barrel Export Scanner
 *
 * Validates that component directories have proper barrel exports
 * (index.ts files) and that imports use barrel paths.
 *
 * @module @dcyfr/ai-cli/scanners/barrel-exports
 */

import { readFile, readdir, writeFile } from 'fs/promises';
import { join, basename } from 'path';
import { pathExists, relativePath } from '@/lib/files.js';
import type { Scanner, ScanContext, ScanResult, ScanViolation, FixResult } from './types.js';

/**
 * Directories that should have barrel exports
 */
const BARREL_DIRS = [
  'src/components',
  'src/components/ui',
  'src/components/blog',
  'src/components/layouts',
  'src/components/shared',
  'src/lib',
  'src/utils',
  'src/hooks',
];

export const barrelExportsScanner: Scanner = {
  id: 'barrel-exports',
  name: 'Barrel Export Compliance',
  description: 'Validates component directories have index.ts barrel exports',
  category: 'compliance',
  projects: ['dcyfr-labs'],

  async scan(context: ScanContext): Promise<ScanResult> {
    const start = Date.now();
    const projectRoot = context.project
      ? join(context.workspaceRoot, context.project)
      : join(context.workspaceRoot, 'dcyfr-labs');

    const violations: ScanViolation[] = [];
    const warnings: ScanViolation[] = [];
    let dirsChecked = 0;
    let dirsWithBarrel = 0;

    for (const dir of BARREL_DIRS) {
      const fullDir = join(projectRoot, dir);
      if (!(await pathExists(fullDir))) continue;

      dirsChecked++;

      // Check for index.ts or index.tsx
      const hasIndex =
        (await pathExists(join(fullDir, 'index.ts'))) ||
        (await pathExists(join(fullDir, 'index.tsx')));

      if (!hasIndex) {
        // Check if directory has any .ts/.tsx files
        let entries;
        try {
          entries = await readdir(fullDir);
        } catch {
          continue;
        }

        const hasSourceFiles = entries.some(
          (e) => (e.endsWith('.ts') || e.endsWith('.tsx')) && e !== 'index.ts' && e !== 'index.tsx',
        );

        if (hasSourceFiles) {
          violations.push({
            id: 'missing-barrel-export',
            severity: 'error',
            message: `Missing barrel export (index.ts) in ${dir}`,
            file: join(dir, 'index.ts'),
            fix: `Create ${dir}/index.ts with exports for all components`,
            autoFixable: true,
          });
        }
      } else {
        dirsWithBarrel++;

        // Validate the barrel file re-exports components
        const indexPath = (await pathExists(join(fullDir, 'index.ts')))
          ? join(fullDir, 'index.ts')
          : join(fullDir, 'index.tsx');

        let content: string;
        try {
          content = await readFile(indexPath, 'utf-8');
        } catch {
          continue;
        }

        // Check for empty barrel files
        const exportCount = (content.match(/export\s/g) || []).length;
        if (exportCount === 0) {
          warnings.push({
            id: 'empty-barrel-export',
            severity: 'warning',
            message: `Barrel export exists but has no exports in ${dir}/index.ts`,
            file: relativePath(context.workspaceRoot, indexPath),
            fix: 'Add export statements for all public components',
          });
        }
      }
    }

    const compliance = dirsChecked > 0 ? dirsWithBarrel / dirsChecked : 1;
    const status = violations.length === 0 ? 'pass' : compliance >= 0.8 ? 'warn' : 'fail';

    return {
      scanner: 'barrel-exports',
      status,
      violations,
      warnings,
      metrics: {
        compliance: Math.round(compliance * 1000) / 10,
        dirsChecked,
        dirsWithBarrel,
        missingBarrels: violations.length,
      },
      duration: Date.now() - start,
      timestamp: new Date().toISOString(),
      summary: `${dirsWithBarrel}/${dirsChecked} directories have barrel exports (${violations.length} missing)`,
    };
  },

  async fix(context: ScanContext, violations: ScanViolation[]): Promise<FixResult> {
    const projectRoot = context.project
      ? join(context.workspaceRoot, context.project)
      : join(context.workspaceRoot, 'dcyfr-labs');

    const filesModified: string[] = [];
    const failures: Array<{ file: string; reason: string }> = [];

    for (const violation of violations) {
      if (violation.id !== 'missing-barrel-export') continue;

      // The violation file is like "src/components/ui/index.ts"
      const dir = violation.file?.replace('/index.ts', '') ?? '';
      const fullDir = join(projectRoot, dir);

      try {
        // Check it exists
        if (!(await pathExists(fullDir))) continue;

        // Safety: don't overwrite existing barrel
        if (
          (await pathExists(join(fullDir, 'index.ts'))) ||
          (await pathExists(join(fullDir, 'index.tsx')))
        ) {
          continue;
        }

        // Discover exportable files
        const entries = await readdir(fullDir);
        const sourceFiles = entries.filter(
          (e) =>
            (e.endsWith('.ts') || e.endsWith('.tsx')) &&
            e !== 'index.ts' &&
            e !== 'index.tsx' &&
            !e.endsWith('.test.ts') &&
            !e.endsWith('.test.tsx') &&
            !e.endsWith('.spec.ts') &&
            !e.endsWith('.spec.tsx') &&
            !e.endsWith('.d.ts'),
        );

        if (sourceFiles.length === 0) continue;

        // Build export lines by scanning files for named exports
        const exportLines: string[] = [];
        for (const file of sourceFiles.sort()) {
          const moduleName = basename(file).replace(/\.(tsx?|jsx?)$/, '');
          const fullPath = join(fullDir, file);
          const content = await readFile(fullPath, 'utf-8');

          // Find named exports
          const namedExports = extractNamedExports(content);
          if (namedExports.length > 0) {
            exportLines.push(`export { ${namedExports.join(', ')} } from './${moduleName}.js';`);
          } else if (content.includes('export default')) {
            // Re-export default as named export using the PascalCase module name
            const pascalName = toPascalCase(moduleName);
            exportLines.push(
              `export { default as ${pascalName} } from './${moduleName}.js';`,
            );
          }
        }

        if (exportLines.length === 0) continue;

        const barrelContent = [
          '/**',
          ` * Barrel exports for ${dir}`,
          ' *',
          ' * Auto-generated by dcyfr fix',
          ' */',
          '',
          ...exportLines,
          '',
        ].join('\n');

        await writeFile(join(fullDir, 'index.ts'), barrelContent, 'utf-8');
        filesModified.push(`${dir}/index.ts`);
      } catch (error) {
        failures.push({
          file: dir,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      scanner: 'barrel-exports',
      fixesApplied: filesModified.length,
      filesModified,
      failures,
    };
  },
};

/**
 * Extract named export identifiers from a TypeScript file
 */
function extractNamedExports(content: string): string[] {
  const exports: string[] = [];

  // Match: export function Foo, export const Foo, export class Foo, export type Foo, etc.
  const namedPattern = /export\s+(?:async\s+)?(?:function|const|let|class|enum|type|interface)\s+(\w+)/g;
  let match: RegExpExecArray | null;

  while ((match = namedPattern.exec(content)) !== null) {
    const name = match[1];
    if (name && !name.startsWith('_')) {
      exports.push(name);
    }
  }

  return exports;
}

/**
 * Convert a kebab-case or snake_case string to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
