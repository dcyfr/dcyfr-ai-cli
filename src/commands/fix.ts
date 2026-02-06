/**
 * Fix command — auto-fix violations detected by scanners
 *
 * Usage:
 *   dcyfr fix                           # Fix all auto-fixable violations
 *   dcyfr fix --dry-run                 # Preview what would be fixed
 *   dcyfr fix license-headers           # Fix specific scanner only
 *   dcyfr fix --project dcyfr-labs      # Fix specific project
 *   dcyfr fix list                      # List fixable scanners
 *
 * @module @dcyfr/ai-cli/commands/fix
 */

import { Command } from 'commander';
import { createLogger } from '@/lib/logger.js';
import { createDefaultRegistry } from '@/scanners/registry.js';
import type { ScanContext } from '@/scanners/types.js';
import { runFixes, listFixableScanners, renderFixReport } from '@/fix/index.js';
import { findWorkspaceRoot } from '@/lib/workspace.js';

const logger = createLogger('fix');

export function createFixCommand(): Command {
  const cmd = new Command('fix')
    .description('Auto-fix violations detected by scanners')
    .argument('[scanner]', 'Specific scanner to fix (e.g., license-headers, tlp-headers)')
    .option('-n, --dry-run', 'Preview fixes without applying them')
    .option('-p, --project <name>', 'Fix within a specific project (e.g., dcyfr-labs)')
    .option('-v, --verbose', 'Verbose output')
    .option('--json', 'Output results as JSON')
    .action(async (scannerArg: string | undefined, options: FixOptions) => {
      try {
        const workspaceRoot = await findWorkspaceRoot();
        const registry = await createDefaultRegistry();

        // Build scan context
        const context: ScanContext = {
          workspaceRoot,
          project: options.project,
          verbose: options.verbose,
          dryRun: options.dryRun,
        };

        // Run the fix engine
        const report = await runFixes(registry, context, {
          dryRun: options.dryRun,
          verbose: options.verbose,
          scanner: scannerArg,
          project: options.project,
        });

        // Output results
        if (options.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(renderFixReport(report));
        }

        // Exit with non-zero if there were failures
        if (report.totalFailures > 0) {
          process.exit(1);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (options.json) {
          console.log(JSON.stringify({ error: message }));
        } else {
          console.error(`\n  ❌ ${message}\n`);
        }

        logger.error('Fix failed', { error: message });
        process.exit(1);
      }
    });

  // Add list subcommand
  cmd
    .command('list')
    .description('List scanners that support auto-fix')
    .action(async () => {
      const registry = await createDefaultRegistry();
      const fixable = listFixableScanners(registry);

      console.log('\n  🔧 Scanners with Auto-Fix Support\n  ' + '─'.repeat(50));

      if (fixable.length === 0) {
        console.log('  No scanners support auto-fix yet.\n');
        return;
      }

      for (const scanner of fixable) {
        const projects = scanner.projects ? ` (${scanner.projects.join(', ')})` : ' (all)';
        console.log(`  • ${scanner.id.padEnd(22)} ${scanner.category.padEnd(14)} ${projects}`);
        console.log(`    ${scanner.description}`);
      }
      console.log('');
    });

  return cmd;
}

interface FixOptions {
  dryRun?: boolean;
  project?: string;
  verbose?: boolean;
  json?: boolean;
}
