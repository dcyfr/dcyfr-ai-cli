/**
 * AI Provider — lightweight LLM abstraction
 *
 * 4-tier provider hierarchy:
 *   Tier 0 (local):        local (MLX :11973, LLaMA.cpp :11454), ollama (:11434)
 *   Tier 1 (workbench):    workbench (RTX 3060 via Tailscale)
 *   Tier 2 (github):       github-models (Azure-hosted, requires Copilot/Pro)
 *   Tier 3 (cloud):        anthropic (high perf, high cost)
 *
 * @module @dcyfr/ai-cli/ai/provider
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { pathExists } from '@/lib/files.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AIProviderType = 'local' | 'openai' | 'ollama' | 'workbench' | 'github-models' | 'anthropic';

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

function isLikelyLocalEndpoint(url?: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new globalThis.URL(url);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '0.0.0.0' ||
      parsed.hostname.startsWith('100.') // Tailscale subnet (common remote-dev path)
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Preferred provider execution order
// ---------------------------------------------------------------------------

/**
 * PREFERRED PROVIDER EXECUTION ORDER
 *
 * Local-first fallback chain — cheapest/most-private tier wins:
 * 1. local    — MLX (:11973) or LLaMA.cpp (:11454), no cost, fully private
 * 2. openai   — OpenAI-compatible endpoint (vLLM, LM Studio, local proxy, or cloud)
 * 3. ollama   — local Ollama (:11434), no cost, fully private
 * 4. workbench — RTX 3060 GPU node via Tailscale, no cost, private
 * 5. github-models — cloud, included with Copilot/Pro, rate-limited
 * 6. anthropic — cloud, high perf, billed per token
 */
export const PREFERRED_PROVIDER_ORDER: AIProviderType[] = [
  'local',
  'openai',
  'ollama',
  'workbench',
  'github-models',
  'anthropic',
];

// ---------------------------------------------------------------------------
// Default configs per provider
// ---------------------------------------------------------------------------

const PROVIDER_DEFAULTS: Record<AIProviderType, { baseUrl: string; model: string; envKey: string }> = {
  // Tier 0 — local private inference
  local: {
    baseUrl: 'http://127.0.0.1:11973/v1',     // MLX server (fallback: :11454 LLaMA.cpp)
    model: 'mlx-community/Phi-3.5-mini-instruct-4bit',
    envKey: 'LOCAL_LLM_API_KEY',               // optional; defaults to 'local' if unset
  },
  // OpenAI-compatible endpoint — vLLM / LM Studio / local proxy / api.openai.com.
  // Base URL is OPENAI_BASE_URL (preferred) or defaults to cloud. Local endpoints
  // (detected via isLikelyLocalEndpoint) get a sentinel key so auth-less proxies work.
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'auto',
    envKey: 'OPENAI_API_KEY',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/api',
    model: 'qwen2.5:7b',
    envKey: '',                                // no key needed
  },
  // Tier 1 — workbench GPU node via Tailscale
  workbench: {
    baseUrl: 'http://localhost:11434',          // overridden by WORKBENCH_BASE_URL at runtime
    model: 'qwen2.5-coder:14b',
    envKey: 'WORKBENCH_API_KEY',               // optional
  },
  // Tier 2 — GitHub Models (requires Copilot/Pro GITHUB_TOKEN)
  'github-models': {
    baseUrl: 'https://models.inference.ai.azure.com',
    model: 'gpt-4o-mini',
    envKey: 'GITHUB_TOKEN',
  },
  // Tier 3 — Anthropic (billed, high perf)
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-haiku-4-5-20251001',
    envKey: 'ANTHROPIC_API_KEY',
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

  // Dynamic base URLs (workbench, local, and openai are env-driven)
  const envBaseUrl =
    provider === 'workbench' ? process.env.WORKBENCH_BASE_URL :
    provider === 'local'     ? process.env.LOCAL_LLM_BASE_URL :
    provider === 'openai'    ? process.env.OPENAI_BASE_URL :
    undefined;

  const resolvedBaseUrl =
    overrides?.baseUrl
    ?? fileConfig.baseUrl
    ?? envBaseUrl
    ?? defaults.baseUrl;

  const resolvedApiKey =
    overrides?.apiKey
    ?? fileConfig.apiKey
    ?? (defaults.envKey ? process.env[defaults.envKey] : undefined)
    ?? (provider === 'local' ? 'local' : undefined)
    ?? (provider === 'openai' && isLikelyLocalEndpoint(resolvedBaseUrl) ? 'local-inference-proxy' : undefined);

  return {
    provider,
    model: overrides?.model ?? fileConfig.model ?? (provider === 'local' ? (process.env.LOCAL_LLM_MODEL ?? defaults.model) : defaults.model),
    apiKey: resolvedApiKey,
    baseUrl: resolvedBaseUrl,
    maxTokens: overrides?.maxTokens ?? fileConfig.maxTokens ?? 4096,
    temperature: overrides?.temperature ?? fileConfig.temperature ?? 0.3,
  };
}

/**
 * Auto-detect the best available provider from environment (local-first)
 */
function detectProvider(): AIProviderType {
  // Tier 0 — local private inference
  if (process.env.LOCAL_LLM_BASE_URL) return 'local';
  // Tier 0 — generic OpenAI-compatible endpoint (vLLM, LM Studio, local proxy, or cloud)
  if (process.env.OPENAI_BASE_URL) return 'openai';
  // Tier 1 — workbench GPU node
  if (process.env.WORKBENCH_BASE_URL) return 'workbench';
  // Tier 2 — GitHub Models
  if (process.env.GITHUB_TOKEN) return 'github-models';
  // Tier 3 — Anthropic
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  // Default — Ollama (local, no key needed)
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

  // Local OpenAI-compat endpoints (MLX, LLaMA.cpp), workbench (Tailscale), and
  // user-configured OpenAI-compat proxies (vLLM, LM Studio) — check /health
  if (
    config.provider === 'local' ||
    ((config.provider === 'workbench' || config.provider === 'openai') && isLikelyLocalEndpoint(config.baseUrl))
  ) {
    const endpoint = config.baseUrl ?? 'http://127.0.0.1:11973/v1';
    const origin = endpoint.replace(/\/v1\/?$/, '');
    try {
      const resp = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) {
        return { ...base, available: true };
      }
      return { ...base, reason: `Local inference endpoint returned ${resp.status}` };
    } catch {
      return { ...base, reason: 'Local inference endpoint not reachable (MLX/LLaMA.cpp not running?)' };
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
    case 'local':
    case 'workbench':
    case 'github-models':
    case 'openai':
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
 * OpenAI-compatible API (local/MLX, workbench/Ollama, github-models)
 */
async function openaiCompletion(
  config: AIProviderConfig,
  messages: AIMessage[],
  start: number,
): Promise<AIResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const resp = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
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
