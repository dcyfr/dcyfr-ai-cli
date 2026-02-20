/**
 * Scan command — run workspace scanners on-demand
 *
 * Usage:
 *   dcyfr scan                    # Full workspace scan
 *   dcyfr scan --quick            # Changed files only
 *   dcyfr scan design-tokens      # Specific scanner
 *   dcyfr scan --project dcyfr-labs
 *   dcyfr scan --json             # Machine-readable output
 *   dcyfr scan --verbose          # Detailed violation output
 *
 * @module @dcyfr/ai-cli/commands/scan
 */

import { Command } from 'commander';
import { createLogger } from '@/lib/logger.js';
import { getChangedFiles } from '@/lib/git.js';
import { createDefaultRegistry } from '@/scanners/registry.js';
import type { ScanContext, ScanResult } from '@/scanners/types.js';
import {
  buildHealthSnapshot,
  saveHealthSnapshot,
  renderScanResults,
  renderScanResultsJson,
} from '@/health/index.js';
import { listProjects } from '@/lib/files.js';
import { findWorkspaceRoot } from '@/lib/workspace.js';

const logger = createLogger('scan');

/**
 * Handle quick scan mode with changed files
 */
async function handleQuickMode(
  workspaceRoot: string,
  context: ScanContext,
  isJsonOutput: boolean,
): Promise<boolean> {
  const changed = await getChangedFiles(workspaceRoot);
  if (changed.length === 0) {
    if (isJsonOutput) {
      console.log(JSON.stringify({ message: 'No changed files', results: [] }));
    } else {
      console.log('\n  ✅ No changed files to scan.\n');
    }
    return true; // Early exit
  }
  context.files = changed;
  return false; // Continue scanning
}

/**
 * Execute scan with specific scanner or all scanners
 */
async function executeScan(
  registry: Awaited<ReturnType<typeof createDefaultRegistry>>,
  scannerArg: string | undefined,
  context: ScanContext,
): Promise<ScanResult[]> {
  if (scannerArg) {
    const scanner = registry.get(scannerArg);
    if (!scanner) {
      console.error(`\n  ❌ Unknown scanner: ${scannerArg}`);
      console.error(`  Available scanners: ${registry.ids().join(', ')}\n`);
      process.exit(1);
    }
    return [await scanner.scan(context)];
  }
  return registry.runAll(context);
}

/**
 * Save health snapshot with project count
 */
async function saveHealthSnapshotIfEnabled(
  workspaceRoot: string,
  results: ScanResult[],
  shouldSave: boolean,
): Promise<void> {
  if (shouldSave) {
    const snapshot = buildHealthSnapshot(results);
    const projects = await listProjects(workspaceRoot);
    snapshot.workspace.packages = projects.length;
    await saveHealthSnapshot(workspaceRoot, snapshot);
  }
}

export function createScanCommand(): Command {
  const cmd = new Command('scan')
    .description('Run workspace scanners')
    .argument('[scanner]', 'Specific scanner to run (e.g., design-tokens, barrel-exports)')
    .option('-q, --quick', 'Quick scan: only changed files (via git diff)')
    .option('-p, --project <name>', 'Scan a specific project (e.g., dcyfr-labs)')
    .option('-v, --verbose', 'Show detailed violation output')
    .option('--json', 'Output results as JSON')
    .option('--no-save', 'Skip saving health snapshot')
    .action(async (scannerArg: string | undefined, options: ScanOptions) => {
      try {
        const workspaceRoot = await findWorkspaceRoot();
        const registry = await createDefaultRegistry();

        // Build scan context
        const context: ScanContext = {
          workspaceRoot,
          project: options.project,
          verbose: options.verbose,
        };

        // Quick mode: handle early exit if no changed files
        if (options.quick) {
          const shouldExit = await handleQuickMode(workspaceRoot, context, !!options.json);
          if (shouldExit) return;
        }

        // Execute scan
        const results = await executeScan(registry, scannerArg, context);

        // Output results
        if (options.json) {
          console.log(renderScanResultsJson(results));
        } else {
          console.log(renderScanResults(results, options.verbose));
        }

        // Save health snapshot
        await saveHealthSnapshotIfEnabled(workspaceRoot, results, options.save !== false);

        // Exit with non-zero if any scanner failed
        const hasFailed = results.some((r) => r.status === 'fail');
        if (hasFailed) {
          process.exit(1);
        }
      } catch (error) {
        logger.error('Scan failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });

  // Add list subcommand
  cmd
    .command('list')
    .description('List all available scanners')
    .action(async () => {
      const registry = await createDefaultRegistry();
      const scanners = registry.all();

      console.log('\n  Available Scanners\n  ' + '─'.repeat(50));
      for (const scanner of scanners) {
        const projects = scanner.projects ? ` (${scanner.projects.join(', ')})` : ' (all)';
        console.log(`  • ${scanner.id.padEnd(22)} ${scanner.category.padEnd(14)} ${projects}`);
        console.log(`    ${scanner.description}`);
      }
      console.log('');
    });

  return cmd;
}

interface ScanOptions {
  quick?: boolean;
  project?: string;
  verbose?: boolean;
  json?: boolean;
  save?: boolean;
}
