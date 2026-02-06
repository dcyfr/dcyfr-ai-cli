/**
 * AI command — manage AI provider configuration and status
 *
 * Usage:
 *   dcyfr ai status              # Check AI provider availability
 *   dcyfr ai config               # View current AI configuration
 *   dcyfr ai config set <key> <value>  # Set AI config value
 *
 * @module @dcyfr/ai-cli/commands/ai
 */

import { Command } from 'commander';
import { findWorkspaceRoot } from '@/lib/workspace.js';
import {
  resolveProvider,
  checkProviderStatus,
  saveProviderConfig,
} from '@/ai/index.js';
import type { AIProviderType } from '@/ai/index.js';

export function createAICommand(): Command {
  const cmd = new Command('ai').description('Manage AI provider configuration');

  // --- status ---
  cmd
    .command('status')
    .description('Check AI provider availability and configuration')
    .action(async () => {
      const workspaceRoot = await findWorkspaceRoot();
      const config = await resolveProvider(workspaceRoot);
      const status = await checkProviderStatus(config);

      console.log('\n  🤖 AI Provider Status\n  ' + '─'.repeat(50));
      console.log(`  Provider:  ${config.provider}`);
      console.log(`  Model:     ${config.model}`);
      console.log(`  API Key:   ${config.apiKey ? '✅ Set' : '❌ Not set'}`);
      console.log(`  Base URL:  ${config.baseUrl}`);
      console.log(`  Available: ${status.available ? '✅ Ready' : '❌ Unavailable'}`);
      if (status.reason) {
        console.log(`  Reason:    ${status.reason}`);
      }
      console.log(`  Max Tokens:   ${config.maxTokens}`);
      console.log(`  Temperature:  ${config.temperature}`);
      console.log('');

      if (!status.available) {
        console.log('  💡 To enable AI-enhanced scanning:');
        if (config.provider === 'ollama') {
          console.log('     • Start Ollama:  ollama serve');
          console.log('     • Pull a model:  ollama pull llama3.2');
        } else {
          const envKey = config.provider === 'anthropic' ? 'ANTHROPIC_API_KEY'
            : config.provider === 'openai' ? 'OPENAI_API_KEY'
              : 'GROQ_API_KEY';
          console.log(`     • Set ${envKey} environment variable`);
          console.log('     • Or use Ollama for local models (free, no API key)');
        }
        console.log('');
      }
    });

  // --- config ---
  const configCmd = cmd
    .command('config')
    .description('View or modify AI configuration');

  configCmd
    .command('show')
    .description('Show current AI configuration')
    .action(async () => {
      const workspaceRoot = await findWorkspaceRoot();
      const config = await resolveProvider(workspaceRoot);

      console.log('\n  ⚙️  AI Configuration\n  ' + '─'.repeat(50));
      console.log(`  provider:    ${config.provider}`);
      console.log(`  model:       ${config.model}`);
      console.log(`  baseUrl:     ${config.baseUrl}`);
      console.log(`  maxTokens:   ${config.maxTokens}`);
      console.log(`  temperature: ${config.temperature}`);
      console.log('');
      console.log('  Config file: .dcyfr/ai.json');
      console.log('  API keys:    Read from environment variables');
      console.log('');
    });

  configCmd
    .command('set')
    .description('Set an AI configuration value')
    .argument('<key>', 'Configuration key (provider, model, baseUrl, maxTokens, temperature)')
    .argument('<value>', 'Configuration value')
    .action(async (key: string, value: string) => {
      const workspaceRoot = await findWorkspaceRoot();
      const validKeys = ['provider', 'model', 'baseUrl', 'maxTokens', 'temperature'];

      if (!validKeys.includes(key)) {
        console.error(`\n  ❌ Invalid key: ${key}`);
        console.error(`  Valid keys: ${validKeys.join(', ')}\n`);
        process.exit(1);
      }

      const update: Record<string, unknown> = {};

      if (key === 'provider') {
        const validProviders = ['anthropic', 'openai', 'groq', 'ollama'];
        if (!validProviders.includes(value)) {
          console.error(`\n  ❌ Invalid provider: ${value}`);
          console.error(`  Valid providers: ${validProviders.join(', ')}\n`);
          process.exit(1);
        }
        update.provider = value as AIProviderType;
      } else if (key === 'maxTokens') {
        update.maxTokens = parseInt(value, 10);
      } else if (key === 'temperature') {
        update.temperature = parseFloat(value);
      } else {
        update[key] = value;
      }

      await saveProviderConfig(workspaceRoot, update);
      console.log(`\n  ✅ Set ${key} = ${value}\n`);
    });

  return cmd;
}
