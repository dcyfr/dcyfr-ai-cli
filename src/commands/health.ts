/**
 * Health command — workspace health dashboard
 *
 * Usage:
 *   dcyfr health                  # Show health dashboard
 *   dcyfr health --json           # Machine-readable output
 *   dcyfr health history          # Show health history
 *   dcyfr health history --days 7 # Last 7 days
 *
 * @module @dcyfr/ai-cli/commands/health
 */

import { Command } from 'commander';
import { createLogger } from '@/lib/logger.js';
import {
  loadHealthSnapshot,
  loadHealthHistory,
  renderHealthDashboard,
  renderSparklineHistory,
} from '@/health/index.js';
import { findWorkspaceRoot } from '@/lib/workspace.js';

const logger = createLogger('health');

export function createHealthCommand(): Command {
  const cmd = new Command('health')
    .description('Show workspace health dashboard')
    .option('--json', 'Output as JSON')
    .action(async (options: HealthOptions) => {
      try {
        const workspaceRoot = await findWorkspaceRoot();
        const snapshot = await loadHealthSnapshot(workspaceRoot);

        if (!snapshot) {
          console.log('\n  No health data available. Run `dcyfr scan` first.\n');
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(snapshot, null, 2));
        } else {
          console.log(renderHealthDashboard(snapshot));

          // Show time since last scan
          const age = Date.now() - new Date(snapshot.timestamp).getTime();
          const ageStr = formatAge(age);
          console.log(`  Last scan: ${ageStr} ago`);
          console.log('  Run `dcyfr scan` to refresh.\n');
        }
      } catch (error) {
        logger.error('Failed to load health data', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });

  // History subcommand
  cmd
    .command('history')
    .description('Show health history over time')
    .option('--days <n>', 'Number of days to show', '30')
    .option('--json', 'Output as JSON')
    .action(async (options: HistoryOptions) => {
      try {
        const workspaceRoot = await findWorkspaceRoot();
        const days = parseInt(options.days, 10);
        const history = await loadHealthHistory(workspaceRoot, days);

        if (history.length === 0) {
          console.log('\n  No health history available. Run `dcyfr scan` to start tracking.\n');
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(history, null, 2));
          return;
        }

        // Use sparkline trend report
        console.log(renderSparklineHistory(history, days));
      } catch (error) {
        logger.error('Failed to load health history', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });

  return cmd;
}

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

interface HealthOptions {
  json?: boolean;
}

interface HistoryOptions {
  days: string;
  json?: boolean;
}
