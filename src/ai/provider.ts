/**
 * AI Provider — lightweight LLM abstraction
 *
 * Supports Anthropic Claude, OpenAI, Groq, and Ollama.
 * Falls back gracefully when no API key is available.
 *
 * @module @dcyfr/ai-cli/ai/provider
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { pathExists } from '@/lib/files.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AIProviderType = 'anthropic' | 'openai' | 'groq' | 'ollama';

export interface AIProviderConfig {
  /** Provider type */
  provider: AIProviderType;
  /** Model name (e.g., 'claude-sonnet-4-20250514') */
  model: string;
  /** API key (reads from env if not set) */
  apiKey?: string | undefined;
  /** Base URL override */
  baseUrl?: string | undefined;
  /** Max tokens for response */
  maxTokens?: number | undefined;
  /** Temperature (0.0–1.0) */
  temperature?: number | undefined;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  provider: AIProviderType;
  duration: number;
}

export interface AIProviderStatus {
  available: boolean;
  provider: AIProviderType;
  model: string;
  reason?: string | undefined;
}

// ---------------------------------------------------------------------------
// Default configs per provider
// ---------------------------------------------------------------------------

const PROVIDER_DEFAULTS: Record<AIProviderType, { baseUrl: string; model: string; envKey: string }> = {
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-20250514',
    envKey: 'ANTHROPIC_API_KEY',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    envKey: 'OPENAI_API_KEY',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    envKey: 'GROQ_API_KEY',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/api',
    model: 'llama3.2',
    envKey: '', // no key needed
  },
};

// ---------------------------------------------------------------------------
// Provider resolution
// ---------------------------------------------------------------------------

/**
 * Resolve provider configuration from environment and workspace config
 */
export async function resolveProvider(
  workspaceRoot: string,
  overrides?: Partial<AIProviderConfig> | undefined,
): Promise<AIProviderConfig> {
  // Load workspace .dcyfr/ai.json config if it exists
  const configPath = join(workspaceRoot, '.dcyfr', 'ai.json');
  let fileConfig: Partial<AIProviderConfig> = {};

  if (await pathExists(configPath)) {
    try {
      const raw = await readFile(configPath, 'utf-8');
      fileConfig = JSON.parse(raw) as Partial<AIProviderConfig>;
    } catch {
      // Ignore malformed config
    }
  }

  // Merge: overrides > file config > env detection
  const provider = overrides?.provider ?? fileConfig.provider ?? detectProvider();
  const defaults = PROVIDER_DEFAULTS[provider];

  return {
    provider,
    model: overrides?.model ?? fileConfig.model ?? defaults.model,
    apiKey: overrides?.apiKey ?? fileConfig.apiKey ?? process.env[defaults.envKey],
    baseUrl: overrides?.baseUrl ?? fileConfig.baseUrl ?? defaults.baseUrl,
    maxTokens: overrides?.maxTokens ?? fileConfig.maxTokens ?? 4096,
    temperature: overrides?.temperature ?? fileConfig.temperature ?? 0.3,
  };
}

/**
 * Auto-detect the best available provider from environment
 */
function detectProvider(): AIProviderType {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GROQ_API_KEY) return 'groq';
  // Default to ollama (local, no key needed)
  return 'ollama';
}

/**
 * Check if an AI provider is available and ready
 */
export async function checkProviderStatus(config: AIProviderConfig): Promise<AIProviderStatus> {
  const base: AIProviderStatus = {
    available: false,
    provider: config.provider,
    model: config.model,
  };

  if (config.provider === 'ollama') {
    // Check if Ollama is running
    try {
      const resp = await fetch(`${config.baseUrl?.replace('/api', '') ?? 'http://localhost:11434'}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      if (resp.ok) {
        return { ...base, available: true };
      }
      return { ...base, reason: `Ollama returned ${resp.status}` };
    } catch {
      return { ...base, reason: 'Ollama not running (start with: ollama serve)' };
    }
  }

  // Cloud providers need API keys
  if (!config.apiKey) {
    const defaults = PROVIDER_DEFAULTS[config.provider];
    return { ...base, reason: `Missing ${defaults.envKey} environment variable` };
  }

  return { ...base, available: true };
}

// ---------------------------------------------------------------------------
// Chat completion
// ---------------------------------------------------------------------------

/**
 * Send a chat completion request to the configured provider
 */
export async function chatCompletion(
  config: AIProviderConfig,
  messages: AIMessage[],
): Promise<AIResponse> {
  const start = Date.now();

  switch (config.provider) {
    case 'anthropic':
      return anthropicCompletion(config, messages, start);
    case 'openai':
    case 'groq':
      return openaiCompletion(config, messages, start);
    case 'ollama':
      return ollamaCompletion(config, messages, start);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

/**
 * Anthropic Messages API
 */
async function anthropicCompletion(
  config: AIProviderConfig,
  messages: AIMessage[],
  start: number,
): Promise<AIResponse> {
  const systemMessage = messages.find((m) => m.role === 'system');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: config.maxTokens ?? 4096,
    temperature: config.temperature ?? 0.3,
    messages: nonSystemMessages.map((m) => ({ role: m.role, content: m.content })),
  };

  if (systemMessage) {
    body.system = systemMessage.content;
  }

  const resp = await fetch(`${config.baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Anthropic API error (${resp.status}): ${error}`);
  }

  const data = (await resp.json()) as {
    content: Array<{ type: string; text: string }>;
    model: string;
    usage: { input_tokens: number; output_tokens: number };
  };

  return {
    content: data.content[0]?.text ?? '',
    model: data.model,
    usage: {
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
    },
    provider: 'anthropic',
    duration: Date.now() - start,
  };
}

/**
 * OpenAI-compatible API (works for OpenAI + Groq)
 */
async function openaiCompletion(
  config: AIProviderConfig,
  messages: AIMessage[],
  start: number,
): Promise<AIResponse> {
  const resp = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.3,
    }),
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`${config.provider} API error (${resp.status}): ${error}`);
  }

  const data = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    content: data.choices[0]?.message.content ?? '',
    model: data.model,
    usage: {
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
    },
    provider: config.provider,
    duration: Date.now() - start,
  };
}

/**
 * Ollama API (local models)
 */
async function ollamaCompletion(
  config: AIProviderConfig,
  messages: AIMessage[],
  start: number,
): Promise<AIResponse> {
  const resp = await fetch(`${config.baseUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      options: {
        temperature: config.temperature ?? 0.3,
        num_predict: config.maxTokens ?? 4096,
      },
    }),
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Ollama API error (${resp.status}): ${error}`);
  }

  const data = (await resp.json()) as {
    message: { content: string };
    model: string;
    eval_count?: number;
    prompt_eval_count?: number;
  };

  return {
    content: data.message.content,
    model: data.model,
    usage: {
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
    },
    provider: 'ollama',
    duration: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

/**
 * Save AI provider configuration to .dcyfr/ai.json
 */
export async function saveProviderConfig(
  workspaceRoot: string,
  config: Partial<AIProviderConfig>,
): Promise<void> {
  const configPath = join(workspaceRoot, '.dcyfr', 'ai.json');
  // Don't persist the API key — that should stay in env
  const { apiKey: _key, ...safeConfig } = config;
  await writeFile(configPath, JSON.stringify(safeConfig, null, 2) + '\n', 'utf-8');
}
