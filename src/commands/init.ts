/**
 * Init command - Initialize a new project
 */

import { Command } from 'commander';
import { createLogger } from '@/lib/logger.js';

const logger = createLogger('init');

export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize DCYFR AI CLI configuration')
    .action(() => {
      try {
        console.log('\n🎉 DCYFR AI CLI\n');
        console.log('Documentation: https://github.com/dcyfr/dcyfr-ai-cli');
        console.log('');
        console.log('Available commands:');
        console.log('  dcyfr status    - Show framework status');
        console.log('  dcyfr validate  - Run validation checks');
        console.log('  dcyfr telemetry - Show telemetry info');
        console.log('  dcyfr init      - Show this help');
        console.log('');
        console.log('Configuration:');
        console.log('  Create a .dcyfr.json file in your project directory');
        console.log('  Or place config.json in your home directory\'s .dcyfr folder');
        console.log('');
        console.log('Get started:');
        console.log('  dcyfr status     - Check framework status');
        console.log('  dcyfr validate   - Run validation checks');
        console.log('');
      } catch (error) {
        logger.error('Init failed', { error });
        process.exit(1);
      }
    });
}
