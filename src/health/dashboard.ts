/**
 * Terminal health dashboard renderer
 *
 * @module @dcyfr/ai-cli/health/dashboard
 */

import type { HealthSnapshot, ScanResult, ScannerHealthEntry } from '@/scanners/types.js';

/**
 * Status icons
 */
const STATUS_ICONS: Record<string, string> = {
  pass: '✅',
  warn: '⚠️ ',
  fail: '❌',
  error: '💥',
  skipped: '⏭️ ',
  healthy: '🟢',
  degraded: '🟡',
  critical: '🔴',
};

/**
 * Scanner display names
 */
const SCANNER_NAMES: Record<string, string> = {
  'design-tokens': 'Design Tokens',
  'barrel-exports': 'Barrel Exports',
  pagelayout: 'PageLayout',
  'license-headers': 'License Headers',
  'tlp-headers': 'TLP Headers',
  'docs-structure': 'Docs Structure',
  'dependency-audit': 'Dependencies',
  'test-data-guardian': 'Test Data Guard',
};

/**
 * Render health dashboard to terminal
 */
export function renderHealthDashboard(snapshot: HealthSnapshot): string {
  const lines: string[] = [];
  const now = new Date(snapshot.timestamp);
  const dateStr = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Header
  lines.push('');
  lines.push('┌──────────────────────────────────────────────────────┐');
  lines.push('│               DCYFR Workspace Health                 │');
  lines.push(`│               ${padCenter(`${dateStr}  ${timeStr}`, 40)}│`);
  lines.push('├──────────────────────┬────────┬──────────────────────┤');
  lines.push('│ Scanner              │ Score  │ Status               │');
  lines.push('├──────────────────────┼────────┼──────────────────────┤');

  // Scanner rows
  const scannerEntries = Object.values(snapshot.scanners);
  for (const entry of scannerEntries) {
    const name = (SCANNER_NAMES[entry.scanner] ?? entry.scanner).padEnd(20);
    const score = formatScore(entry);
    const status = formatStatus(entry);
    lines.push(`│ ${name} │ ${score} │ ${status} │`);
  }

  // Footer
  lines.push('├──────────────────────┼────────┼──────────────────────┤');
  const overallIcon = STATUS_ICONS[snapshot.overall.status] ?? '?';
  const overallScore = `${snapshot.overall.score.toFixed(1)}%`.padStart(6);
  const overallStatus = `${overallIcon} ${snapshot.overall.status.toUpperCase()}`.padEnd(20);
  lines.push(`│ ${'OVERALL'.padEnd(20)} │ ${overallScore} │ ${overallStatus} │`);
  lines.push('└──────────────────────┴────────┴──────────────────────┘');

  // Duration
  if (snapshot.workspace.lastScanDuration > 0) {
    const dur = (snapshot.workspace.lastScanDuration / 1000).toFixed(1);
    lines.push(`  Scan completed in ${dur}s`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Render scan results as a list (for `dcyfr scan` output)
 */
export function renderScanResults(results: ScanResult[], verbose: boolean = false): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('  DCYFR Workspace Scan Results');
  lines.push('  ' + '─'.repeat(40));
  lines.push('');

  for (const result of results) {
    const icon = STATUS_ICONS[result.status] ?? '?';
    const name = SCANNER_NAMES[result.scanner] ?? result.scanner;
    lines.push(`  ${icon} ${name}`);
    if (result.summary) {
      lines.push(`     ${result.summary}`);
    }

    if (verbose && result.violations.length > 0) {
      lines.push(`     Violations (${result.violations.length}):`);
      for (const v of result.violations.slice(0, 10)) {
        const loc = v.file ? `${v.file}${v.line ? `:${v.line}` : ''}` : '';
        lines.push(`       • ${v.message}${loc ? ` (${loc})` : ''}`);
      }
      if (result.violations.length > 10) {
        lines.push(`       ... and ${result.violations.length - 10} more`);
      }
    }

    if (verbose && result.warnings.length > 0) {
      lines.push(`     Warnings (${result.warnings.length}):`);
      for (const w of result.warnings.slice(0, 5)) {
        lines.push(`       ⚠ ${w.message}`);
      }
      if (result.warnings.length > 5) {
        lines.push(`       ... and ${result.warnings.length - 5} more`);
      }
    }

    lines.push('');
  }

  // Summary line
  const passed = results.filter((r) => r.status === 'pass').length;
  const warned = results.filter((r) => r.status === 'warn').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const errored = results.filter((r) => r.status === 'error').length;
  const total = results.length;

  lines.push(
    `  ${passed}/${total} passed` +
      (warned > 0 ? ` · ${warned} warnings` : '') +
      (failed > 0 ? ` · ${failed} failed` : '') +
      (errored > 0 ? ` · ${errored} errors` : ''),
  );
  lines.push('');

  return lines.join('\n');
}

/**
 * Render results as JSON (for scripting)
 */
export function renderScanResultsJson(results: ScanResult[]): string {
  return JSON.stringify(results, null, 2);
}

function formatScore(entry: ScannerHealthEntry): string {
  if (entry.metrics['compliance'] !== undefined) {
    return `${entry.metrics['compliance']!.toFixed(1)}%`.padStart(6);
  }
  if (entry.metrics['usage'] !== undefined) {
    return `${entry.metrics['usage']!.toFixed(1)}%`.padStart(6);
  }
  if (entry.metrics['total'] !== undefined) {
    return `${entry.metrics['total']}`.padStart(6);
  }
  return `  ${STATUS_ICONS[entry.status] ?? '?'}  `;
}

function formatStatus(entry: ScannerHealthEntry): string {
  const icon = STATUS_ICONS[entry.status] ?? '?';
  let detail = '';

  if (entry.violations > 0) {
    detail = `${entry.violations} err`;
  }
  if (entry.warnings > 0) {
    detail += detail ? `, ${entry.warnings} warn` : `${entry.warnings} warn`;
  }
  if (!detail) {
    detail = entry.status === 'pass' ? 'clean' : entry.status;
  }

  return `${icon} ${detail}`.padEnd(20);
}

function padCenter(str: string, width: number): string {
  if (str.length >= width) return str;
  const leftPad = Math.floor((width - str.length) / 2);
  const rightPad = width - str.length - leftPad;
  return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
}
