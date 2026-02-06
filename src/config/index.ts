/**
 * Configuration module barrel export
 *
 * @module @dcyfr/ai-cli/config
 */

export {
  loadConfig,
  saveConfig,
  initConfig,
  validateConfig,
  renderConfig,
  DEFAULT_CONFIG,
} from './schema.js';

export type {
  DcyfrConfig,
  DaemonSettingsConfig,
  LogConfig,
  NotifyConfig,
  AISettingsConfig,
  ScannerConfig,
  ConfigValidationError,
} from './schema.js';
