/**
 * TypeScript interfaces for CLI library mode
 */

/**
 * Result returned by runCLI in library mode
 */
export interface CLIResult {
  /** Exit code (0 for success, non-zero for error) */
  exitCode: number;
  /** Standard output captured during execution */
  stdout: string;
  /** Standard error captured during execution */
  stderr: string;
}

/**
 * Options for runCLI library mode execution
 */
export interface CLIOptions {
  /** If true, throw errors instead of returning them as values. Default: false */
  throw?: boolean;
}
