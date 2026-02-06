#!/usr/bin/env node
/**
 * DCYFR AI CLI
 *
 * Command-line interface for the DCYFR AI framework
 * Portable across Windows, macOS, and Linux
 */

import { Command } from 'commander';

import { createStatusCommand } from './commands/status.js';
import { createValidateCommand } from './commands/validate.js';
import { createTelemetryCommand } from './commands/telemetry.js';
import { createInitCommand } from './commands/init.js';
import { createScanCommand } from './commands/scan.js';
import { createHealthCommand } from './commands/health.js';
import { createDaemonCommand } from './commands/daemon.js';
import { createFixCommand } from './commands/fix.js';
import { createAICommand } from './commands/ai.js';
import { createConfigCommand } from './commands/config.js';

const program = new Command();

program
  .name('dcyfr')
  .description('DCYFR AI Framework CLI - Cross-platform command-line interface')
  .version('1.0.0');

// Register commands
program.addCommand(createStatusCommand());
program.addCommand(createValidateCommand());
program.addCommand(createTelemetryCommand());
program.addCommand(createInitCommand());
program.addCommand(createScanCommand());
program.addCommand(createHealthCommand());
program.addCommand(createDaemonCommand());
program.addCommand(createFixCommand());
program.addCommand(createAICommand());
program.addCommand(createConfigCommand());

/**
 * Default help command
 */
program.on('command:*', () => {
  if (process.argv[2] && !program.commands.some((cmd) => cmd.name() === process.argv[2])) {
    console.error(`\n❌ Unknown command: ${process.argv[2]}`);
    console.error('Run "dcyfr --help" for usage information\n');
    process.exit(1);
  }
});

/**
 * Parse CLI arguments
 */
export function runCLI(): void {
  program.parse();
}

/**
 * Run if executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  runCLI();
}

export { program };
