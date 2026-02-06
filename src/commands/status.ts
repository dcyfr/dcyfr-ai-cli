/**
 * Status command - Show framework status
 */

import { Command } from 'commander';
import { createLogger } from '@/lib/logger.js';
import { loadConfig } from '@/lib/config.js';

const logger = createLogger('status');

export function createStatusCommand(): Command {
  return new Command('status')
    .description('Show DCYFR AI framework status')
    .action(async () => {
      try {
        const config = await loadConfig();

        console.log('\n🚀 DCYFR AI Framework Status\n');
        console.log(`Validation: ${config.validation.enabled ? '✅ Enabled' : '❌ Disabled'}`);
        console.log(`Telemetry:  ${config.telemetry.enabled ? '✅ Enabled' : '❌ Disabled'}`);
        console.log(`\nNode Version: ${process.version}`);
        console.log(`Platform:     ${process.platform} (${process.arch})`);
        console.log(
          `Memory:       ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB / ${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
        );
        console.log('');
      } catch (error) {
        logger.error('Failed to get status', { error });
        process.exit(1);
      }
    });
}
