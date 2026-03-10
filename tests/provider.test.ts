/**
 * AI provider fallback behavior tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { checkProviderStatus, chatCompletion, resolveProvider } from '../src/ai/provider.js';

const ORIGINAL_ENV = { ...process.env };

async function createTempWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'dcyfr-ai-cli-provider-'));
}

describe('AI provider local fallback', () => {
  let workspaceRoot = '';

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    workspaceRoot = await createTempWorkspace();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    if (workspaceRoot) {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('resolves OPENAI_BASE_URL local endpoint without requiring cloud key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GROQ_API_KEY;

    process.env.OPENAI_BASE_URL = 'http://127.0.0.1:3130/v1';

    const config = await resolveProvider(workspaceRoot);

    expect(config.provider).toBe('openai');
    expect(config.baseUrl).toBe('http://127.0.0.1:3130/v1');
    expect(config.apiKey).toBe('local-inference-proxy');
  });

  it('checks local OpenAI-compatible endpoint health via /health', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const status = await checkProviderStatus({
      provider: 'openai',
      model: 'auto',
      baseUrl: 'http://127.0.0.1:3130/v1',
      apiKey: undefined,
    });

    expect(status.available).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3130/health',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('sends OpenAI-compatible requests without Authorization header when apiKey is absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'qwen2.5-coder:14b',
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 12, completion_tokens: 8 },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const response = await chatCompletion(
      {
        provider: 'openai',
        model: 'auto',
        baseUrl: 'http://127.0.0.1:3130/v1',
        apiKey: undefined,
      },
      [{ role: 'user', content: 'quick code quality check' }],
    );

    expect(response.content).toBe('ok');

    const callArgs = fetchMock.mock.calls[0];
    const requestInit = callArgs?.[1] as RequestInit;
    const headers = (requestInit?.headers ?? {}) as Record<string, string>;

    expect(headers.Authorization).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
  });
});
