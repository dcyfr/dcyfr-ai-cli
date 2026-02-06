/**
 * Telemetry command - Show telemetry information
 */

import { Command } from 'commander';
import { createLogger } from '@/lib/logger.js';
import { loadConfig } from '@/lib/config.js';

const logger = createLogger('telemetry');

export function createTelemetryCommand(): Command {
  return new Command('telemetry')
    .description('Show telemetry configuration')
    .action(async () => {
      try {
        const config = await loadConfig();

        console.log('\n📊 Telemetry Configuration\n');
        console.log(`Status:  ${config.telemetry.enabled ? '✅ Enabled' : '❌ Disabled'}`);
        console.log(`Storage: file`);
        console.log(`Path:    .dcyfr/telemetry`);
        console.log('');

        if (!config.telemetry.enabled) {
          console.log('💡 Enable telemetry in config to collect metrics\n');
        }
      } catch (error) {
        logger.error('Failed to get telemetry info', { error });
        process.exit(1);
      }
    });
}
