/**
 * Validate command — Run DCYFR compliance validation
 *
 * This replaces the original stub with real scanner integration.
 *
 * @module @dcyfr/ai-cli/commands/validate
 */

import { Command } from 'commander';
import { createLogger } from '@/lib/logger.js';
import { createDefaultRegistry } from '@/scanners/registry.js';
import type { ScanContext } from '@/scanners/types.js';
import { safeExit } from '@/lib/mode.js';
import {
  buildHealthSnapshot,
  saveHealthSnapshot,
  renderScanResults,
} from '@/health/index.js';
import { listProjects } from '@/lib/files.js';
import { findWorkspaceRoot } from '@/lib/workspace.js';

const logger = createLogger('validate');

export function createValidateCommand(): Command {
  return new Command('validate')
    .description('Run DCYFR AI validation checks (compliance, security, governance)')
    .option('-v, --verbose', 'Verbose output')
    .option('-p, --project <name>', 'Validate a specific project')
    .option('--json', 'Output results as JSON')
    .action(async (options) => {
      try {
        const workspaceRoot = await findWorkspaceRoot();
        const registry = await createDefaultRegistry();

        if (!options.json) {
          console.log('\n🔍 Running DCYFR Validation Checks\n');
        }

        const context: ScanContext = {
          workspaceRoot,
          project: options.project,
          verbose: options.verbose,
        };

        // Run all scanners
        const results = await registry.runAll(context);

        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          console.log(renderScanResults(results, options.verbose));
        }

        // Save health snapshot
        const snapshot = buildHealthSnapshot(results);
        const projects = await listProjects(workspaceRoot);
        snapshot.workspace.packages = projects.length;
        await saveHealthSnapshot(workspaceRoot, snapshot);

        // Exit with non-zero if any scanner failed
        const hasFailed = results.some((r) => r.status === 'fail');
        if (hasFailed) {
          if (!options.json) {
            console.log('  ❌ Validation failed. See violations above.\n');
          }
          safeExit(1);
        } else {
          if (!options.json) {
            console.log('  ✅ Validation passed.\n');
          }
        }
      } catch (error) {
        logger.error('Validation failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        safeExit(1);
      }
    });
}
