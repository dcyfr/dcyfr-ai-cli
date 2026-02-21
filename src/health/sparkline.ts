/**
 * Sparkline and trend visualization for health history
 *
 * Unicode sparkline characters: ▁▂▃▄▅▆▇█
 * Trend arrows: ↑ ↓ → ↗ ↘
 *
 * @module @dcyfr/ai-cli/health/sparkline
 */

import type { HealthSnapshot } from '@/scanners/types.js';

/** Unicode sparkline characters (8 levels) */
const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/** Trend arrow indicators */
const TREND = {
  up: '\x1b[32m↑\x1b[0m',       // green
  slightUp: '\x1b[32m↗\x1b[0m', // green
  flat: '\x1b[90m→\x1b[0m',     // gray
  slightDown: '\x1b[33m↘\x1b[0m', // yellow
  down: '\x1b[31m↓\x1b[0m',     // red
} as const;

/**
 * Generate a sparkline string from an array of numeric values (0-100)
 */
export function sparkline(values: number[], width?: number | undefined): string {
  if (values.length === 0) return '';

  // If width is specified, sample/compress values to fit
  let data = values;
  if (width !== undefined && values.length > width) {
    data = sampleValues(values, width);
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  return data
    .map((v) => {
      const idx = Math.round(((v - min) / range) * (SPARK_CHARS.length - 1));
      return SPARK_CHARS[Math.max(0, Math.min(idx, SPARK_CHARS.length - 1))]!;
    })
    .join('');
}

/**
 * Colorize a sparkline based on health thresholds
 */
export function colorSparkline(values: number[], width?: number | undefined): string {
  if (values.length === 0) return '';

  let data = values;
  if (width !== undefined && values.length > width) {
    data = sampleValues(values, width);
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  return data
    .map((v) => {
      const idx = Math.round(((v - min) / range) * (SPARK_CHARS.length - 1));
      const char = SPARK_CHARS[Math.max(0, Math.min(idx, SPARK_CHARS.length - 1))]!;

      // Color based on absolute health value
      if (v >= 90) return `\x1b[32m${char}\x1b[0m`;       // green
      if (v >= 70) return `\x1b[33m${char}\x1b[0m`;       // yellow
      return `\x1b[31m${char}\x1b[0m`;                     // red
    })
    .join('');
}

/**
 * Calculate trend from a series of values
 */
export function calculateTrend(values: number[]): string {
  if (values.length < 2) return TREND.flat;

  // Compare last 3 values average vs prior 3
  const recentCount = Math.min(3, Math.floor(values.length / 2));
  const recent = values.slice(-recentCount);
  const prior = values.slice(-recentCount * 2, -recentCount);

  if (prior.length === 0) return TREND.flat;

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
  const diff = recentAvg - priorAvg;

  if (diff > 5) return TREND.up;
  if (diff > 1) return TREND.slightUp;
  if (diff < -5) return TREND.down;
  if (diff < -1) return TREND.slightDown;
  return TREND.flat;
}

/**
 * Render a full sparkline health history report
 */
export function renderSparklineHistory(
  history: HealthSnapshot[],
  days: number,
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('  ╔══════════════════════════════════════════════════════════╗');
  lines.push('  ║           DCYFR Health History — Trend Report           ║');
  lines.push('  ╚══════════════════════════════════════════════════════════╝');
  lines.push('');

  if (history.length === 0) {
    lines.push('  No health data available. Run `dcyfr scan` to start tracking.');
    lines.push('');
    return lines.join('\n');
  }

  // ── Overall Health Sparkline ──────────────────────────────

  const overallScores = history.map((h) => h.overall.score);
  const currentScore = overallScores[overallScores.length - 1]!;
  const trend = calculateTrend(overallScores);
  const spark = colorSparkline(overallScores, 40);

  lines.push(`  Overall Health  ${spark}  ${currentScore.toFixed(1)}% ${trend}`);
  lines.push('');

  // ── Statistics ────────────────────────────────────────────

  const minScore = Math.min(...overallScores);
  const maxScore = Math.max(...overallScores);
  const avgScore = overallScores.reduce((a, b) => a + b, 0) / overallScores.length;

  lines.push(`  Period: last ${days} days (${history.length} snapshots)`);
  lines.push(`  Min: ${minScore.toFixed(1)}%  │  Max: ${maxScore.toFixed(1)}%  │  Avg: ${avgScore.toFixed(1)}%`);
  lines.push('');

  // ── Per-Scanner Trends ────────────────────────────────────

  lines.push('  ┌────────────────────┬──────────────────────────────────────────┬────────┬───┐');
  lines.push('  │ Scanner            │ Trend (40 pts)                           │ Latest │ Δ │');
  lines.push('  ├────────────────────┼──────────────────────────────────────────┼────────┼───┤');

  // Collect all scanner IDs that appear in history
  const scannerIds = new Set<string>();
  for (const snap of history) {
    for (const id of Object.keys(snap.scanners)) {
      scannerIds.add(id);
    }
  }

  const scannerNames: Record<string, string> = {
    'design-tokens': 'Design Tokens',
    'barrel-exports': 'Barrel Exports',
    pagelayout: 'PageLayout',
    'license-headers': 'License Headers',
    'tlp-headers': 'TLP Headers',
    'docs-structure': 'Docs Structure',
    'dependency-audit': 'Dependencies',
    'test-data-guardian': 'Test Data Guard',
    'docs-generator': 'Docs Generator',
    'code-smell': 'Code Smell',
    'api-compliance': 'API Compliance',
  };

  for (const scannerId of [...scannerIds].sort((a, b) => a.localeCompare(b))) {
    const scores = history.map((h) => {
      const entry = h.scanners[scannerId];
      if (!entry) return null;
      return entry.score;
    }).filter((s): s is number => s !== null);

    if (scores.length === 0) continue;

    const name = (scannerNames[scannerId] ?? scannerId).padEnd(18);
    const latest = `${scores[scores.length - 1]!.toFixed(1)}%`.padStart(6);
    const scannerTrend = calculateTrend(scores);

    // Build the row with ANSI-aware padding
    const sparkStr = colorSparkline(scores, 40);
    const sparkVisualLen = stripAnsi(sparkStr).length;
    const sparkPad = Math.max(0, 40 - sparkVisualLen);

    lines.push(`  │ ${name} │ ${sparkStr}${' '.repeat(sparkPad)} │ ${latest} │ ${scannerTrend} │`);
  }

  lines.push('  └────────────────────┴──────────────────────────────────────────┴────────┴───┘');
  lines.push('');

  // ── Recent Entries ────────────────────────────────────────

  const recentMax = 10;
  const recent = history.slice(-recentMax);

  lines.push('  Recent Scans:');
  lines.push('  ' + '─'.repeat(55));

  for (const snap of recent) {
    const date = new Date(snap.timestamp);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const score = snap.overall.score;
    const icon =
      snap.overall.status === 'healthy'
        ? '🟢'
        : snap.overall.status === 'degraded'
          ? '🟡'
          : '🔴';

    const miniSpark = colorSparkline([score], 1);
    lines.push(`  ${dateStr} ${timeStr}  ${miniSpark} ${score.toFixed(1).padStart(5)}% ${icon}`);
  }

  if (history.length > recentMax) {
    lines.push(`  ... ${history.length - recentMax} older entries`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Sample values to fit a target width
 */
function sampleValues(values: number[], width: number): number[] {
  if (values.length <= width) return values;

  const result: number[] = [];
  const step = values.length / width;

  for (let i = 0; i < width; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end && j < values.length; j++) {
      sum += values[j]!;
      count++;
    }
    result.push(count > 0 ? sum / count : 0);
  }

  return result;
}

/**
 * Strip ANSI escape codes to get visual length
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Count ANSI code characters (for padding calculations)
 */
export function countAnsiCodes(str: string): number {
  return str.length - stripAnsi(str).length;
}


