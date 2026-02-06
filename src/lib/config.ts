/**
 * Configuration loader for the CLI application
 * Cross-platform configuration handling
 */

import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

export interface AppConfig {
  telemetry: {
    enabled: boolean;
    level: string;
    endpoints: Array<{
      type: string;
      level?: string;
      path?: string;
    }>;
  };
  validation: {
    enabled: boolean;
    strict: boolean;
  };
  cli?: {
    verboseLogging: boolean;
    colorOutput: boolean;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  telemetry: {
    enabled: true,
    level: 'info',
    endpoints: [{ type: 'console', level: 'info' }],
  },
  validation: {
    enabled: true,
    strict: true,
  },
  cli: {
    verboseLogging: false,
    colorOutput: true,
  },
};

/**
 * Get the configuration directory based on the OS
 * Windows: %APPDATA%/.dcyfr
 * macOS/Linux: ~/.dcyfr
 */
export function getConfigDir(): string {
  const platform = process.platform;

  if (platform === 'win32') {
    const appData = process.env.APPDATA;
    if (!appData) {
      throw new Error('APPDATA environment variable not set on Windows');
    }
    return join(appData, '.dcyfr');
  }

  return join(homedir(), '.dcyfr');
}

/**
 * Load application configuration
 * Merges default config with environment-specific overrides
 * Cross-platform compatible
 */
export async function loadConfig(): Promise<AppConfig> {
  const configPaths = [
    join(process.cwd(), '.dcyfr.json'),
    join(process.cwd(), 'config.json'),
    join(getConfigDir(), 'config.json'),
  ];

  for (const configPath of configPaths) {
    try {
      const configFile = await readFile(configPath, 'utf-8');
      const customConfig = JSON.parse(configFile) as Partial<AppConfig>;

      return {
        ...DEFAULT_CONFIG,
        ...customConfig,
      };
    } catch {
      // Continue to next config path
      continue;
    }
  }

  // Use default config if no file found
  return DEFAULT_CONFIG;
}

/**
 * Get configuration value by path
 */
export function getConfigValue<T = unknown>(config: AppConfig, path: string): T | undefined {
  const keys = path.split('.');
  let value: unknown = config;

  for (const key of keys) {
    if (typeof value === 'object' && value !== null && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return value as T;
}
