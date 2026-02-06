/**
 * Fix Engine — orchestrates auto-fix operations
 *
 * Flow: scan → filter autoFixable → call scanner.fix() → report
 *
 * @module @dcyfr/ai-cli/fix/engine
 */

import type { Scanner, ScanContext, ScanResult, FixResult } from '@/scanners/types.js';
import type { ScannerRegistry } from '@/scanners/registry.js';

/**
 * Options for a fix run
 */
export interface FixRunOptions {
  /** Only report what would be fixed, don't apply */
  dryRun?: boolean | undefined;
  /** Verbose output */
  verbose?: boolean | undefined;
  /** Specific scanner to fix against */
  scanner?: string | undefined;
  /** Specific project to target */
  project?: string | undefined;
}

/**
 * Aggregated result from a fix run
 */
export interface FixRunReport {
  /** Per-scanner fix results */
  results: FixResultEntry[];
  /** Total fixes applied across all scanners */
  totalFixes: number;
  /** Total files modified */
  totalFilesModified: number;
  /** Total failures */
  totalFailures: number;
  /** Duration in milliseconds */
  duration: number;
  /** Whether this was a dry run */
  dryRun: boolean;
}

/**
 * Fix result paired with its scan context
 */
export interface FixResultEntry {
  scanner: string;
  scannerName: string;
  /** Violations found that are auto-fixable */
  autoFixableCount: number;
  /** Actual fix result (null if scanner has no fix method) */
  fixResult: FixResult | null;
  /** Error message if fix failed */
  error?: string | undefined;
}

/**
 * Run the fix engine against a registry
 */
export async function runFixes(
  registry: ScannerRegistry,
  context: ScanContext,
  options: FixRunOptions = {},
): Promise<FixRunReport> {
  const start = Date.now();
  const results: FixResultEntry[] = [];

  // Get scanners to run
  const scanners = options.scanner
    ? (() => {
        const s = registry.get(options.scanner);
        return s ? [s] : [];
      })()
    : registry.all();

  // Filter to only scanners that have a fix() method
  const fixableScanners = scanners.filter((s) => typeof s.fix === 'function');

  if (fixableScanners.length === 0 && options.scanner) {
    const scanner = registry.get(options.scanner);
    if (!scanner) {
      throw new Error(`Unknown scanner: ${options.scanner}`);
    }
    if (!scanner.fix) {
      throw new Error(`Scanner '${options.scanner}' does not support auto-fix`);
    }
  }

  for (const scanner of fixableScanners) {
    const entry = await runScannerFix(scanner, context, options);
    results.push(entry);
  }

  const totalFixes = results.reduce((sum, r) => sum + (r.fixResult?.fixesApplied ?? 0), 0);
  const allModified = results.flatMap((r) => r.fixResult?.filesModified ?? []);
  const uniqueFiles = new Set(allModified);
  const totalFailures = results.reduce((sum, r) => sum + (r.fixResult?.failures.length ?? 0), 0);

  return {
    results,
    totalFixes,
    totalFilesModified: uniqueFiles.size,
    totalFailures,
    duration: Date.now() - start,
    dryRun: options.dryRun ?? false,
  };
}

/**
 * Run fix for a single scanner: scan → filter → fix
 */
async function runScannerFix(
  scanner: Scanner,
  context: ScanContext,
  options: FixRunOptions,
): Promise<FixResultEntry> {
  try {
    // Step 1: Scan to find violations
    const scanResult: ScanResult = await scanner.scan(context);

    // Step 2: Filter to auto-fixable violations
    const autoFixable = scanResult.violations.filter((v) => v.autoFixable);

    if (autoFixable.length === 0) {
      return {
        scanner: scanner.id,
        scannerName: scanner.name,
        autoFixableCount: 0,
        fixResult: {
          scanner: scanner.id,
          fixesApplied: 0,
          filesModified: [],
          failures: [],
        },
      };
    }

    // Step 3: Call fix (or report dry run)
    if (options.dryRun) {
      return {
        scanner: scanner.id,
        scannerName: scanner.name,
        autoFixableCount: autoFixable.length,
        fixResult: null,
      };
    }

    const fixContext: ScanContext = {
      ...context,
      dryRun: false,
    };

    const fixResult = await scanner.fix!(fixContext, autoFixable);

    return {
      scanner: scanner.id,
      scannerName: scanner.name,
      autoFixableCount: autoFixable.length,
      fixResult,
    };
  } catch (error) {
    return {
      scanner: scanner.id,
      scannerName: scanner.name,
      autoFixableCount: 0,
      fixResult: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * List which scanners support auto-fix
 */
export function listFixableScanners(registry: ScannerRegistry): Scanner[] {
  return registry.all().filter((s) => typeof s.fix === 'function');
}

/**
 * Render a fix report to the console
 */
export function renderFixReport(report: FixRunReport): string {
  const lines: string[] = [];

  if (report.dryRun) {
    lines.push('');
    lines.push('  🔍 DRY RUN — no changes applied');
    lines.push('  ─'.padEnd(52, '─'));
  } else {
    lines.push('');
    lines.push('  🔧 Auto-Fix Report');
    lines.push('  ─'.padEnd(52, '─'));
  }

  for (const entry of report.results) {
    const icon = entry.error
      ? '❌'
      : entry.autoFixableCount === 0
        ? '✅'
        : report.dryRun
          ? '📋'
          : '🔧';

    lines.push(`  ${icon} ${entry.scannerName}`);

    if (entry.error) {
      lines.push(`     Error: ${entry.error}`);
      continue;
    }

    if (entry.autoFixableCount === 0) {
      lines.push('     No auto-fixable violations');
      continue;
    }

    if (report.dryRun) {
      lines.push(`     ${entry.autoFixableCount} violations can be auto-fixed`);
      continue;
    }

    if (entry.fixResult) {
      lines.push(`     Applied: ${entry.fixResult.fixesApplied} fixes`);
      lines.push(`     Files modified: ${entry.fixResult.filesModified.length}`);
      if (entry.fixResult.failures.length > 0) {
        lines.push(`     ⚠️  Failures: ${entry.fixResult.failures.length}`);
        for (const f of entry.fixResult.failures) {
          lines.push(`        • ${f.file}: ${f.reason}`);
        }
      }
    }
  }

  lines.push('');
  lines.push('  ─'.padEnd(52, '─'));

  if (report.dryRun) {
    const total = report.results.reduce((s, r) => s + r.autoFixableCount, 0);
    lines.push(`  Total fixable: ${total} violations`);
    lines.push('  Run without --dry-run to apply fixes');
  } else {
    lines.push(`  Total fixes: ${report.totalFixes}`);
    lines.push(`  Files modified: ${report.totalFilesModified}`);
    if (report.totalFailures > 0) {
      lines.push(`  Failures: ${report.totalFailures}`);
    }
  }

  lines.push(`  Duration: ${report.duration}ms`);
  lines.push('');

  return lines.join('\n');
}
