/**
 * `dcyfr config` command — configuration management
 *
 * Subcommands:
 *   dcyfr config show           # Display current configuration
 *   dcyfr config init           # Create default config file
 *   dcyfr config validate       # Validate config file
 *   dcyfr config set <key> <val> # Set a config value
 *   dcyfr config reset          # Reset to defaults
 *
 * @module @dcyfr/ai-cli/commands/config
 */

import { Command } from 'commander';
import { findWorkspaceRoot } from '@/lib/workspace.js';
import {
  loadConfig,
  saveConfig,
  initConfig,
  renderConfig,
  DEFAULT_CONFIG,
} from '@/config/index.js';

export function createConfigCommand(): Command {
  const config = new Command('config').description('Manage DCYFR configuration');

  // ── config show ──────────────────────────────────────────

  config
    .command('show')
    .description('Display current configuration')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      const workspaceRoot = await findWorkspaceRoot();
      const { config: cfg, errors } = await loadConfig(workspaceRoot);

      if (options.json) {
        console.log(JSON.stringify(cfg, null, 2));
        return;
      }

      console.log(renderConfig(cfg));

      if (errors.length > 0) {
        console.log('  ⚠️  Config validation warnings:');
        for (const err of errors) {
          console.log(`    ${err.path}: ${err.message}`);
        }
        console.log('');
      }
    });

  // ── config init ──────────────────────────────────────────

  config
    .command('init')
    .description('Create default configuration file')
    .action(async () => {
      const workspaceRoot = await findWorkspaceRoot();

      const created = await initConfig(workspaceRoot);
      if (created) {
        console.log('\n  ✅ Created .dcyfr/config.json with defaults\n');
      } else {
        console.log('\n  ℹ️  .dcyfr/config.json already exists. Use "dcyfr config reset" to overwrite.\n');
      }
    });

  // ── config validate ──────────────────────────────────────

  config
    .command('validate')
    .description('Validate configuration file')
    .action(async () => {
      const workspaceRoot = await findWorkspaceRoot();
      const { errors } = await loadConfig(workspaceRoot);

      if (errors.length === 0) {
        console.log('\n  ✅ Configuration is valid\n');
      } else {
        console.log(`\n  ❌ ${errors.length} validation error(s):\n`);
        for (const err of errors) {
          console.log(`    ${err.path || '(root)'}: ${err.message}`);
          if (err.value !== null && err.value !== undefined) {
            console.log(`      Got: ${JSON.stringify(err.value)}`);
          }
        }
        console.log('');
        process.exit(1);
      }
    });

  // ── config set ───────────────────────────────────────────

  config
    .command('set <key> <value>')
    .description('Set a configuration value (e.g., daemon.maxMemoryMB 512)')
    .action(async (key: string, value: string) => {
      const workspaceRoot = await findWorkspaceRoot();
      const { config: cfg } = await loadConfig(workspaceRoot);

      // Parse the dotted key path
      const parts = key.split('.');
      if (parts.length < 2) {
        console.log('\n  ❌ Key must be in format: section.key (e.g., daemon.maxMemoryMB)\n');
        process.exit(1);
      }

      // Parse value (auto-detect type)
      let parsedValue: unknown;
      if (value === 'true') parsedValue = true;
      else if (value === 'false') parsedValue = false;
      else if (/^\d+$/.test(value)) parsedValue = parseInt(value, 10);
      else if (/^\d+\.\d+$/.test(value)) parsedValue = parseFloat(value);
      else parsedValue = value;

      // Set the value using path traversal
      setNestedValue(cfg as unknown as Record<string, unknown>, parts, parsedValue);

      await saveConfig(workspaceRoot, cfg);
      console.log(`\n  ✅ Set ${key} = ${JSON.stringify(parsedValue)}\n`);
    });

  // ── config reset ─────────────────────────────────────────

  config
    .command('reset')
    .description('Reset configuration to defaults')
    .action(async () => {
      const workspaceRoot = await findWorkspaceRoot();
      await saveConfig(workspaceRoot, { ...DEFAULT_CONFIG });
      console.log('\n  ✅ Configuration reset to defaults\n');
    });

  return config;
}

/**
 * Set a value at a nested path
 */
function setNestedValue(obj: Record<string, unknown>, parts: string[], value: unknown): void {
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = parts[parts.length - 1]!;
  current[lastKey] = value;
}
