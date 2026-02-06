/**
 * Health scoring, state persistence, and history tracking
 *
 * @module @dcyfr/ai-cli/health/state
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { pathExists } from '@/lib/files.js';
import type { ScanResult, HealthSnapshot, ScannerHealthEntry } from '@/scanners/types.js';

const DCYFR_DIR = '.dcyfr';
const HEALTH_FILE = 'health.json';
const HISTORY_FILE = 'health-history.json';

/**
 * Ensure .dcyfr directory exists
 */
async function ensureDcyfrDir(workspaceRoot: string): Promise<string> {
  const dir = join(workspaceRoot, DCYFR_DIR);
  if (!(await pathExists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

/**
 * Calculate an aggregate health score from scan results
 */
export function calculateHealthScore(results: ScanResult[]): number {
  if (results.length === 0) return 100;

  let totalWeight = 0;
  let weightedScore = 0;

  for (const result of results) {
    // Weight by scanner importance
    const weight = getScannerWeight(result.scanner);
    totalWeight += weight;

    // Score based on status
    let score: number;
    switch (result.status) {
      case 'pass':
        score = 100;
        break;
      case 'warn':
        score = 70;
        break;
      case 'fail':
        score = 30;
        break;
      case 'error':
        score = 0;
        break;
      case 'skipped':
        totalWeight -= weight; // Don't count skipped
        continue;
      default:
        score = 0;
    }

    // Refine score with compliance metric if available
    if (result.metrics['compliance'] !== undefined) {
      score = result.metrics['compliance']!;
    } else if (result.metrics['usage'] !== undefined) {
      score = result.metrics['usage']!;
    }

    weightedScore += score * weight;
  }

  return totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 10) / 10 : 100;
}

/**
 * Get scanner weight for health scoring
 */
function getScannerWeight(scanner: string): number {
  const weights: Record<string, number> = {
    'design-tokens': 3,
    'barrel-exports': 2,
    pagelayout: 2,
    'license-headers': 1,
    'tlp-headers': 1,
    'docs-structure': 1,
    'dependency-audit': 3,
    'test-data-guardian': 3,
    'docs-generator': 2,
    'code-smell': 2,
    'api-compliance': 3,
  };
  return weights[scanner] ?? 1;
}

/**
 * Build a health snapshot from scan results
 */
export function buildHealthSnapshot(results: ScanResult[]): HealthSnapshot {
  const score = calculateHealthScore(results);
  const scanners: Record<string, ScannerHealthEntry> = {};

  for (const result of results) {
    scanners[result.scanner] = {
      scanner: result.scanner,
      score:
        result.metrics['compliance'] ?? result.metrics['usage'] ?? (result.status === 'pass' ? 100 : result.status === 'warn' ? 70 : 30),
      status: result.status,
      lastRun: result.timestamp,
      violations: result.violations.length,
      warnings: result.warnings.length,
      metrics: result.metrics,
      summary: result.summary,
    };
  }

  return {
    timestamp: new Date().toISOString(),
    overall: {
      score,
      status: score >= 90 ? 'healthy' : score >= 70 ? 'degraded' : 'critical',
    },
    scanners,
    workspace: {
      packages: 0, // Filled in by caller
      lastScanDuration: results.reduce((sum, r) => sum + r.duration, 0),
    },
  };
}

/**
 * Save health snapshot to disk
 */
export async function saveHealthSnapshot(
  workspaceRoot: string,
  snapshot: HealthSnapshot,
): Promise<void> {
  const dir = await ensureDcyfrDir(workspaceRoot);
  await writeFile(join(dir, HEALTH_FILE), JSON.stringify(snapshot, null, 2));

  // Append to history
  await appendToHistory(dir, snapshot);
}

/**
 * Load the latest health snapshot
 */
export async function loadHealthSnapshot(workspaceRoot: string): Promise<HealthSnapshot | null> {
  const filePath = join(workspaceRoot, DCYFR_DIR, HEALTH_FILE);
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as HealthSnapshot;
  } catch {
    return null;
  }
}

/**
 * Append snapshot to history (keep last 90 days)
 */
async function appendToHistory(dcyfrDir: string, snapshot: HealthSnapshot): Promise<void> {
  const historyPath = join(dcyfrDir, HISTORY_FILE);
  let history: HealthSnapshot[] = [];

  try {
    const content = await readFile(historyPath, 'utf-8');
    history = JSON.parse(content) as HealthSnapshot[];
  } catch {
    // No history yet
  }

  history.push(snapshot);

  // Keep only last 90 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  history = history.filter((h) => new Date(h.timestamp) >= cutoff);

  await writeFile(historyPath, JSON.stringify(history, null, 2));
}

/**
 * Load health history
 */
export async function loadHealthHistory(
  workspaceRoot: string,
  days?: number,
): Promise<HealthSnapshot[]> {
  const historyPath = join(workspaceRoot, DCYFR_DIR, HISTORY_FILE);
  let history: HealthSnapshot[] = [];

  try {
    const content = await readFile(historyPath, 'utf-8');
    history = JSON.parse(content) as HealthSnapshot[];
  } catch {
    return [];
  }

  if (days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    history = history.filter((h) => new Date(h.timestamp) >= cutoff);
  }

  return history;
}
