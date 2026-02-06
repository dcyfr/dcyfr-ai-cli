/**
 * Unified configuration schema for DCYFR CLI
 *
 * All settings are stored in `.dcyfr/config.json` at the workspace root.
 * Validation is performed at load time — invalid keys are reported but
 * the daemon continues with defaults for missing/invalid values.
 *
 * @module @dcyfr/ai-cli/config/schema
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { pathExists } from '@/lib/files.js';

const DCYFR_DIR = '.dcyfr';
const CONFIG_FILE = 'config.json';

// ── Configuration Types ──────────────────────────────────────

/**
 * Scanner-specific configuration overrides
 */
export interface ScannerConfig {
  /** Whether this scanner is enabled (default: true) */
  enabled: boolean;
  /** Files/patterns to exclude from this scanner */
  exclude?: string[] | undefined;
  /** Scanner-specific options */
  options?: Record<string, unknown> | undefined;
}

/**
 * Daemon configuration section
 */
export interface DaemonSettingsConfig {
  /** Health heartbeat interval in ms (default: 60000) */
  healthInterval: number;
  /** Maximum memory usage in MB before warning (default: 256) */
  maxMemoryMB: number;
  /** Time to wait for graceful shutdown in ms (default: 10000) */
  gracefulShutdownTimeout: number;
  /** Enable file watcher (default: true) */
  watcherEnabled: boolean;
  /** Enable scheduler (default: true) */
  schedulerEnabled: boolean;
  /** Debounce time for file watcher in ms (default: 1000) */
  watcherDebounceMs: number;
}

/**
 * Log rotation configuration section
 */
export interface LogConfig {
  /** Maximum log file size in bytes (default: 5MB) */
  maxSizeBytes: number;
  /** Number of rotated files to keep (default: 5) */
  maxFiles: number;
}

/**
 * Notification configuration section
 */
export interface NotifyConfig {
  /** Enable terminal bell on health degradation (default: true) */
  terminalBell: boolean;
  /** Enable macOS native notifications (default: true) */
  osNotification: boolean;
  /** Webhook URL for POST notifications */
  webhookUrl?: string | undefined;
  /** Minimum score change to trigger notification (default: 10) */
  threshold: number;
  /** Cooldown between notifications in ms (default: 300000) */
  cooldownMs: number;
}

/**
 * AI provider configuration section
 */
export interface AISettingsConfig {
  /** Preferred AI provider */
  provider?: string | undefined;
  /** Model to use */
  model?: string | undefined;
  /** Maximum tokens for AI requests */
  maxTokens: number;
  /** Temperature for AI requests */
  temperature: number;
  /** Rate limit: max requests per minute */
  rateLimitPerMinute: number;
}

/**
 * Complete DCYFR configuration
 */
export interface DcyfrConfig {
  /** Schema version for migration support */
  $schema: string;
  /** Daemon settings */
  daemon: DaemonSettingsConfig;
  /** Log rotation settings */
  logs: LogConfig;
  /** Notification settings */
  notifications: NotifyConfig;
  /** AI provider settings */
  ai: AISettingsConfig;
  /** Per-scanner overrides */
  scanners: Record<string, ScannerConfig>;
}

// ── Defaults ─────────────────────────────────────────────────

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: DcyfrConfig = {
  $schema: 'https://dcyfr.ai/schemas/config.v1.json',
  daemon: {
    healthInterval: 60_000,
    maxMemoryMB: 256,
    gracefulShutdownTimeout: 10_000,
    watcherEnabled: true,
    schedulerEnabled: true,
    watcherDebounceMs: 1_000,
  },
  logs: {
    maxSizeBytes: 5 * 1024 * 1024,
    maxFiles: 5,
  },
  notifications: {
    terminalBell: true,
    osNotification: true,
    threshold: 10,
    cooldownMs: 5 * 60 * 1000,
  },
  ai: {
    maxTokens: 4096,
    temperature: 0.3,
    rateLimitPerMinute: 30,
  },
  scanners: {},
};

// ── Validation ───────────────────────────────────────────────

/**
 * Validation error
 */
export interface ConfigValidationError {
  path: string;
  message: string;
  value: unknown;
}

/**
 * Validate a configuration object
 */
export function validateConfig(config: unknown): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  if (typeof config !== 'object' || config === null) {
    errors.push({ path: '', message: 'Config must be an object', value: config });
    return errors;
  }

  const obj = config as Record<string, unknown>;

  // Validate daemon section
  if (obj['daemon'] !== undefined) {
    const daemon = obj['daemon'];
    if (typeof daemon !== 'object' || daemon === null) {
      errors.push({ path: 'daemon', message: 'Must be an object', value: daemon });
    } else {
      const d = daemon as Record<string, unknown>;
      validateNumber(d, 'healthInterval', 1_000, 3_600_000, errors, 'daemon');
      validateNumber(d, 'maxMemoryMB', 64, 2048, errors, 'daemon');
      validateNumber(d, 'gracefulShutdownTimeout', 1_000, 60_000, errors, 'daemon');
      validateBoolean(d, 'watcherEnabled', errors, 'daemon');
      validateBoolean(d, 'schedulerEnabled', errors, 'daemon');
      validateNumber(d, 'watcherDebounceMs', 100, 30_000, errors, 'daemon');
    }
  }

  // Validate logs section
  if (obj['logs'] !== undefined) {
    const logs = obj['logs'];
    if (typeof logs !== 'object' || logs === null) {
      errors.push({ path: 'logs', message: 'Must be an object', value: logs });
    } else {
      const l = logs as Record<string, unknown>;
      validateNumber(l, 'maxSizeBytes', 100_000, 100_000_000, errors, 'logs');
      validateNumber(l, 'maxFiles', 1, 20, errors, 'logs');
    }
  }

  // Validate notifications section
  if (obj['notifications'] !== undefined) {
    const notify = obj['notifications'];
    if (typeof notify !== 'object' || notify === null) {
      errors.push({ path: 'notifications', message: 'Must be an object', value: notify });
    } else {
      const n = notify as Record<string, unknown>;
      validateBoolean(n, 'terminalBell', errors, 'notifications');
      validateBoolean(n, 'osNotification', errors, 'notifications');
      validateNumber(n, 'threshold', 1, 50, errors, 'notifications');
      validateNumber(n, 'cooldownMs', 10_000, 3_600_000, errors, 'notifications');
      if (n['webhookUrl'] !== undefined && typeof n['webhookUrl'] !== 'string') {
        errors.push({ path: 'notifications.webhookUrl', message: 'Must be a string (URL)', value: n['webhookUrl'] });
      }
    }
  }

  // Validate AI section
  if (obj['ai'] !== undefined) {
    const ai = obj['ai'];
    if (typeof ai !== 'object' || ai === null) {
      errors.push({ path: 'ai', message: 'Must be an object', value: ai });
    } else {
      const a = ai as Record<string, unknown>;
      validateNumber(a, 'maxTokens', 256, 32_768, errors, 'ai');
      validateNumber(a, 'temperature', 0, 2, errors, 'ai');
      validateNumber(a, 'rateLimitPerMinute', 1, 1000, errors, 'ai');
    }
  }

  return errors;
}

// ── Load / Save ──────────────────────────────────────────────

/**
 * Load configuration from disk, merging with defaults
 */
export async function loadConfig(workspaceRoot: string): Promise<{
  config: DcyfrConfig;
  errors: ConfigValidationError[];
}> {
  const configPath = join(workspaceRoot, DCYFR_DIR, CONFIG_FILE);

  if (!(await pathExists(configPath))) {
    return { config: { ...DEFAULT_CONFIG }, errors: [] };
  }

  try {
    const content = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<DcyfrConfig>;
    const errors = validateConfig(parsed);

    // Deep merge with defaults
    const config = deepMerge(
      DEFAULT_CONFIG as unknown as Record<string, unknown>,
      parsed as unknown as Record<string, unknown>,
    ) as unknown as DcyfrConfig;

    return { config, errors };
  } catch (error) {
    return {
      config: { ...DEFAULT_CONFIG },
      errors: [{
        path: '',
        message: `Failed to parse config: ${error instanceof Error ? error.message : String(error)}`,
        value: null,
      }],
    };
  }
}

/**
 * Save configuration to disk
 */
export async function saveConfig(workspaceRoot: string, config: DcyfrConfig): Promise<void> {
  const dir = join(workspaceRoot, DCYFR_DIR);
  if (!(await pathExists(dir))) {
    await mkdir(dir, { recursive: true });
  }

  const configPath = join(dir, CONFIG_FILE);
  await writeFile(configPath, JSON.stringify(config, null, 2));
}

/**
 * Initialize a config file with defaults if it doesn't exist
 */
export async function initConfig(workspaceRoot: string): Promise<boolean> {
  const configPath = join(workspaceRoot, DCYFR_DIR, CONFIG_FILE);

  if (await pathExists(configPath)) {
    return false; // Already exists
  }

  await saveConfig(workspaceRoot, DEFAULT_CONFIG);
  return true;
}

/**
 * Render config for display
 */
export function renderConfig(config: DcyfrConfig): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('  DCYFR Configuration');
  lines.push('  ─────────────────────────────────');
  lines.push('');

  // Daemon
  lines.push('  [daemon]');
  lines.push(`    healthInterval:       ${config.daemon.healthInterval}ms`);
  lines.push(`    maxMemoryMB:          ${config.daemon.maxMemoryMB} MB`);
  lines.push(`    gracefulShutdown:     ${config.daemon.gracefulShutdownTimeout}ms`);
  lines.push(`    watcher:              ${config.daemon.watcherEnabled ? '✅' : '❌'}`);
  lines.push(`    scheduler:            ${config.daemon.schedulerEnabled ? '✅' : '❌'}`);
  lines.push(`    watcherDebounce:      ${config.daemon.watcherDebounceMs}ms`);
  lines.push('');

  // Logs
  lines.push('  [logs]');
  lines.push(`    maxSize:              ${(config.logs.maxSizeBytes / 1024 / 1024).toFixed(1)} MB`);
  lines.push(`    maxFiles:             ${config.logs.maxFiles}`);
  lines.push('');

  // Notifications
  lines.push('  [notifications]');
  lines.push(`    terminalBell:         ${config.notifications.terminalBell ? '✅' : '❌'}`);
  lines.push(`    osNotification:       ${config.notifications.osNotification ? '✅' : '❌'}`);
  lines.push(`    webhookUrl:           ${config.notifications.webhookUrl ?? '(none)'}`);
  lines.push(`    threshold:            ${config.notifications.threshold}%`);
  lines.push(`    cooldown:             ${config.notifications.cooldownMs / 1000}s`);
  lines.push('');

  // AI
  lines.push('  [ai]');
  lines.push(`    provider:             ${config.ai.provider ?? '(auto-detect)'}`);
  lines.push(`    model:                ${config.ai.model ?? '(default)'}`);
  lines.push(`    maxTokens:            ${config.ai.maxTokens}`);
  lines.push(`    temperature:          ${config.ai.temperature}`);
  lines.push(`    rateLimit:            ${config.ai.rateLimitPerMinute}/min`);
  lines.push('');

  // Scanners
  const scannerOverrides = Object.entries(config.scanners);
  if (scannerOverrides.length > 0) {
    lines.push('  [scanners]');
    for (const [id, cfg] of scannerOverrides) {
      const status = cfg.enabled ? '✅' : '❌';
      const excludes = cfg.exclude ? ` (${cfg.exclude.length} exclusions)` : '';
      lines.push(`    ${id}: ${status}${excludes}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Helpers ──────────────────────────────────────────────────

function validateNumber(
  obj: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  errors: ConfigValidationError[],
  prefix: string,
): void {
  const val = obj[key];
  if (val === undefined) return;
  if (typeof val !== 'number' || val < min || val > max) {
    errors.push({
      path: `${prefix}.${key}`,
      message: `Must be a number between ${min} and ${max}`,
      value: val,
    });
  }
}

function validateBoolean(
  obj: Record<string, unknown>,
  key: string,
  errors: ConfigValidationError[],
  prefix: string,
): void {
  const val = obj[key];
  if (val === undefined) return;
  if (typeof val !== 'boolean') {
    errors.push({
      path: `${prefix}.${key}`,
      message: 'Must be a boolean',
      value: val,
    });
  }
}

/**
 * Deep merge two objects (target values override source)
 */
function deepMerge(source: Record<string, unknown>, target: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...source };

  for (const [key, value] of Object.entries(target)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      key in result &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}
