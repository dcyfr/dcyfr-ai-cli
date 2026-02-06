/**
 * Scanner type definitions for the DCYFR daemon/CLI
 *
 * Defines the interfaces for scanners, scan contexts, results,
 * and violations used across all scanner implementations.
 *
 * @module @dcyfr/ai-cli/scanners/types
 */

/**
 * Scanner category classification
 */
export type ScannerCategory =
  | 'compliance'
  | 'security'
  | 'documentation'
  | 'cleanup'
  | 'testing'
  | 'governance';

/**
 * Scan result status
 */
export type ScanStatus = 'pass' | 'warn' | 'fail' | 'error' | 'skipped';

/**
 * Violation severity
 */
export type ViolationSeverity = 'error' | 'warning' | 'info';

/**
 * Context passed to a scanner when executing a scan
 */
export interface ScanContext {
  /** Workspace root directory */
  workspaceRoot: string;
  /** Specific files to scan (undefined = full scan) */
  files?: string[] | undefined;
  /** Specific project to scan (e.g., 'dcyfr-labs') */
  project?: string | undefined;
  /** Scanner-specific options */
  options?: Record<string, unknown> | undefined;
  /** Dry run mode (no modifications) */
  dryRun?: boolean | undefined;
  /** Verbose output */
  verbose?: boolean | undefined;
}

/**
 * Individual violation detected by a scanner
 */
export interface ScanViolation {
  /** Violation identifier */
  id: string;
  /** Severity level */
  severity: ViolationSeverity;
  /** Human-readable message */
  message: string;
  /** File where violation was found */
  file?: string | undefined;
  /** Line number (1-based) */
  line?: number | undefined;
  /** Column number (0-based) */
  column?: number | undefined;
  /** Suggested fix description */
  fix?: string | undefined;
  /** Whether this violation can be auto-fixed */
  autoFixable?: boolean | undefined;
}

/**
 * Result from a scanner execution
 */
export interface ScanResult {
  /** Scanner that produced this result */
  scanner: string;
  /** Overall status */
  status: ScanStatus;
  /** Error-level violations */
  violations: ScanViolation[];
  /** Warning-level issues */
  warnings: ScanViolation[];
  /** Numeric metrics (e.g., compliance: 0.96) */
  metrics: Record<string, number>;
  /** Duration in milliseconds */
  duration: number;
  /** ISO timestamp */
  timestamp: string;
  /** Summary message */
  summary?: string;
}

/**
 * Result from an auto-fix operation
 */
export interface FixResult {
  /** Scanner that performed the fix */
  scanner: string;
  /** Number of fixes applied */
  fixesApplied: number;
  /** Files modified */
  filesModified: string[];
  /** Fixes that failed */
  failures: Array<{
    file: string;
    reason: string;
  }>;
}

/**
 * Scanner interface — all scanners implement this
 */
export interface Scanner {
  /** Unique scanner identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what the scanner checks */
  description: string;
  /** Category classification */
  category: ScannerCategory;
  /** Projects this scanner applies to (undefined = all) */
  projects?: string[] | undefined;

  /** Execute the scan */
  scan(context: ScanContext): Promise<ScanResult>;

  /** Optional: auto-fix detected violations */
  fix?(context: ScanContext, violations: ScanViolation[]): Promise<FixResult>;
}

/**
 * Health snapshot for a single scanner
 */
export interface ScannerHealthEntry {
  scanner: string;
  score: number;
  status: ScanStatus;
  lastRun: string;
  violations: number;
  warnings: number;
  metrics: Record<string, number>;
  summary?: string | undefined;
}

/**
 * Workspace health snapshot
 */
export interface HealthSnapshot {
  timestamp: string;
  overall: {
    score: number;
    status: 'healthy' | 'degraded' | 'critical';
  };
  scanners: Record<string, ScannerHealthEntry>;
  workspace: {
    packages: number;
    lastScanDuration: number;
  };
}
