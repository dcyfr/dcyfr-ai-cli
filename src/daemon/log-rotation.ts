/**
 * Log rotation for daemon log files
 *
 * Rotates `.dcyfr/daemon.log` based on file size.
 * Keeps N rotated files (daemon.log.1, daemon.log.2, etc.)
 *
 * @module @dcyfr/ai-cli/daemon/log-rotation
 */

import { stat, rename, unlink, readFile, writeFile } from 'fs/promises';
import { pathExists } from '@/lib/files.js';

/**
 * Log rotation configuration
 */
export interface LogRotationConfig {
  /** Maximum log file size in bytes before rotation (default: 5MB) */
  maxSizeBytes: number;
  /** Number of rotated files to keep (default: 5) */
  maxFiles: number;
  /** Whether to compress rotated files (future) */
  compress: boolean;
}

/**
 * Default log rotation config
 */
export const DEFAULT_LOG_ROTATION: LogRotationConfig = {
  maxSizeBytes: 5 * 1024 * 1024, // 5 MB
  maxFiles: 5,
  compress: false,
};

/**
 * Check if log file needs rotation and rotate if necessary
 *
 * @returns true if rotation was performed
 */
export async function rotateLogIfNeeded(
  logFilePath: string,
  config: LogRotationConfig = DEFAULT_LOG_ROTATION,
): Promise<boolean> {
  if (!(await pathExists(logFilePath))) return false;

  try {
    const stats = await stat(logFilePath);
    if (stats.size < config.maxSizeBytes) return false;

    await rotateLog(logFilePath, config);
    return true;
  } catch {
    return false;
  }
}

/**
 * Perform log rotation
 *
 * daemon.log → daemon.log.1
 * daemon.log.1 → daemon.log.2
 * ...
 * daemon.log.N → deleted
 */
async function rotateLog(logFilePath: string, config: LogRotationConfig): Promise<void> {
  // Delete the oldest if it exceeds maxFiles
  const oldest = `${logFilePath}.${config.maxFiles}`;
  if (await pathExists(oldest)) {
    await unlink(oldest);
  }

  // Shift existing rotated files: .4 → .5, .3 → .4, etc.
  for (let i = config.maxFiles - 1; i >= 1; i--) {
    const from = `${logFilePath}.${i}`;
    const to = `${logFilePath}.${i + 1}`;
    if (await pathExists(from)) {
      await rename(from, to);
    }
  }

  // Move current log to .1
  await rename(logFilePath, `${logFilePath}.1`);

  // Create a fresh empty log file
  await writeFile(logFilePath, '');
}

/**
 * Get total size of all log files (current + rotated)
 */
export async function getLogStorageSize(logFilePath: string, maxFiles: number = 5): Promise<number> {
  let totalSize = 0;

  // Current log
  try {
    const stats = await stat(logFilePath);
    totalSize += stats.size;
  } catch {
    // No current log
  }

  // Rotated logs
  for (let i = 1; i <= maxFiles; i++) {
    try {
      const stats = await stat(`${logFilePath}.${i}`);
      totalSize += stats.size;
    } catch {
      break; // No more rotated files
    }
  }

  return totalSize;
}

/**
 * Clean up all rotated log files (keep only current)
 */
export async function cleanRotatedLogs(logFilePath: string, maxFiles: number = 5): Promise<number> {
  let cleaned = 0;

  for (let i = 1; i <= maxFiles; i++) {
    const rotatedPath = `${logFilePath}.${i}`;
    if (await pathExists(rotatedPath)) {
      await unlink(rotatedPath);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Read all log content (current + rotated, most recent first)
 */
export async function readAllLogs(
  logFilePath: string,
  maxFiles: number = 5,
  maxLines: number = 500,
): Promise<string[]> {
  const allLines: string[] = [];

  // Read current log first (newest)
  try {
    const content = await readFile(logFilePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    allLines.push(...lines);
  } catch {
    // No current log
  }

  // Read rotated logs (newest to oldest)
  for (let i = 1; i <= maxFiles; i++) {
    if (allLines.length >= maxLines) break;

    try {
      const content = await readFile(`${logFilePath}.${i}`, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      // Prepend since rotated files are older
      allLines.unshift(...lines);
    } catch {
      break; // No more rotated files
    }
  }

  // Return most recent N lines
  return allLines.slice(-maxLines);
}
