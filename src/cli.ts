#!/usr/bin/env node
/**
 * DCYFR AI CLI
 *
 * Command-line interface for the DCYFR AI framework
 * Portable across Windows, macOS, and Linux
 */

import { Command } from 'commander';
import { CLIResult, CLIOptions } from './lib/types.js';
import { setLibraryMode, isLibraryMode } from './lib/mode.js';

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
  .version('1.0.0')
  .exitOverride(); // Prevent Commander from calling process.exit

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
 * Handle unknown commands through Commander error system
 */
program.on('command:*', () => {
  const unknownCommand = process.argv[2];
  console.error(`\n❌ Unknown command: ${unknownCommand}`);
  console.error('Run "dcyfr --help" for usage information\n');
  
  if (!isLibraryMode()) {
    process.exit(1);
  } else {
    // Create a Commander-style error that mimics unknown option behavior
    const commanderError = new Error(`Unknown command: ${unknownCommand}`) as any;
    commanderError.code = 'commander.unknownCommand';
    commanderError.exitCode = 1;
    throw commanderError;
  }
});

/**
 * Run CLI with provided arguments (library mode)
 * @param args - Command line arguments (defaults to process.argv.slice(2))
 * @param options - CLI options including error handling strategy
 * @returns Promise resolving to CLI result with exit code and captured output
 */
export async function runCLI(
  args: string[] = process.argv.slice(2),
  options: CLIOptions = {}
): Promise<CLIResult> {
  // Enable library mode to prevent process.exit
  setLibraryMode(true);
  
  const stdout: string[] = [];
  const stderr: string[] = [];

  // Capture console output
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalExit = process.exit;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  // Mock process.exit to prevent test termination
  (process.exit as any) = (code?: number) => {
    throw new Error(`process.exit unexpectedly called with "${code}"`);
  };

  // Capture process.stdout.write (what Commander uses)
  (process.stdout as any).write = (chunk: any) => {
    const text = chunk.toString();
    stdout.push(text);
    return originalStdoutWrite(chunk);
  };

  // Capture process.stderr.write
  (process.stderr as any).write = (chunk: any) => {
    const text = chunk.toString();
    stderr.push(text);
    return originalStderrWrite(chunk);
  };

  console.log = (...args: unknown[]) => {
    stdout.push(args.join(' '));
    originalLog(...args);
  };

  console.error = (...args: unknown[]) => {
    stderr.push(args.join(' '));
    originalError(...args);
  };

  console.warn = (...args: unknown[]) => {
    stderr.push(args.join(' '));
    originalWarn(...args);
  };

  try {
    // Parse arguments
    await program.parseAsync(args, { from: 'user' });

    // Restore all hooks
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    process.exit = originalExit;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    setLibraryMode(false);

    return {
      exitCode: 0,
      stdout: stdout.join('').trim(),
      stderr: stderr.join('').trim(),
    };
  } catch (error) {
    // Restore all hooks
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    process.exit = originalExit;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    setLibraryMode(false);

    // Handle Commander.js exit override errors
    // CommanderError has .exitCode and .code properties
    if (error && typeof error === 'object' && 'code' in error) {
      const commanderError = error as {
        code: string;
        exitCode: number;
        message: string;
      };

      // commander.helpDisplayed and commander.version are successful exits
      if (
        commanderError.code === 'commander.helpDisplayed' ||
        commanderError.code === 'commander.version'
      ) {
        return {
          exitCode: 0,
          stdout: stdout.join('').trim(),
          stderr: stderr.join('').trim(),
        };
      }

      // Unknown command and other errors should return exit code 1
      if (options.throw) {
        throw error;
      }

      return {
        exitCode: commanderError.exitCode || 1,
        stdout: stdout.join('').trim(),
        stderr: stderr.join('').trim(),
      };
    }

    // Generic error handling
    const errorMessage = error instanceof Error ? error.message : String(error);
    stderr.push(errorMessage);

    if (options.throw) {
      throw error;
    }

    return {
      exitCode: 1,
      stdout: stdout.join('').trim(),
      stderr: stderr.join('').trim(),
    };
  }
}

/**
 * Run if executed directly (binary mode)
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  runCLI().then((result) => {
    process.exit(result.exitCode);
  }).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { program };
