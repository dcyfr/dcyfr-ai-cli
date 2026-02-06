/**
 * AI Scanner base — shared logic for LLM-powered scanners
 *
 * Provides batched file analysis, prompt building, response parsing,
 * and graceful degradation when no LLM is available.
 *
 * @module @dcyfr/ai-cli/ai/ai-scanner
 */

import { readFile } from 'fs/promises';
import type { ScanContext, ScanResult, ScanViolation } from '@/scanners/types.js';
import { relativePath } from '@/lib/files.js';
import type { AIMessage } from './provider.js';
import { resolveProvider, checkProviderStatus, chatCompletion } from './provider.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A file prepared for AI analysis
 */
export interface AnalysisFile {
  path: string;
  relativePath: string;
  content: string;
  /** Truncated content for token efficiency */
  snippet: string;
}

/**
 * Result from AI analysis of a single file
 */
export interface AIAnalysisResult {
  file: string;
  violations: ScanViolation[];
  summary: string;
}

/**
 * Configuration for an AI scanner
 */
export interface AIScannerConfig {
  /** Maximum characters of file content to send per file */
  maxFileChars?: number | undefined;
  /** Maximum files per LLM batch request */
  batchSize?: number | undefined;
  /** System prompt for the LLM */
  systemPrompt: string;
  /** Template for the user prompt (receives file list) */
  buildUserPrompt: (files: AnalysisFile[]) => string;
  /** Parse LLM response into violations */
  parseResponse: (response: string, files: AnalysisFile[]) => AIAnalysisResult[];
}

// ---------------------------------------------------------------------------
// Core analysis pipeline
// ---------------------------------------------------------------------------

/**
 * Run AI-powered analysis on a list of files
 *
 * Handles: provider resolution, batching, LLM calls, response parsing.
 * Returns empty results if no provider is available (offline mode).
 */
export async function runAIAnalysis(
  context: ScanContext,
  filePaths: string[],
  config: AIScannerConfig,
): Promise<{
  results: AIAnalysisResult[];
  providerUsed: string | null;
  totalTokens: number;
  offline: boolean;
}> {
  // Resolve provider
  const providerConfig = await resolveProvider(context.workspaceRoot);
  const status = await checkProviderStatus(providerConfig);

  if (!status.available) {
    return {
      results: [],
      providerUsed: null,
      totalTokens: 0,
      offline: true,
    };
  }

  // Prepare files
  const maxChars = config.maxFileChars ?? 3000;
  const analysisFiles: AnalysisFile[] = [];

  for (const filePath of filePaths) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const relPath = relativePath(context.workspaceRoot, filePath);
      analysisFiles.push({
        path: filePath,
        relativePath: relPath,
        content,
        snippet: content.slice(0, maxChars),
      });
    } catch {
      // Skip unreadable files
    }
  }

  if (analysisFiles.length === 0) {
    return { results: [], providerUsed: providerConfig.provider, totalTokens: 0, offline: false };
  }

  // Batch and analyze
  const batchSize = config.batchSize ?? 5;
  const allResults: AIAnalysisResult[] = [];
  let totalTokens = 0;

  for (let i = 0; i < analysisFiles.length; i += batchSize) {
    const batch = analysisFiles.slice(i, i + batchSize);

    const messages: AIMessage[] = [
      { role: 'system', content: config.systemPrompt },
      { role: 'user', content: config.buildUserPrompt(batch) },
    ];

    try {
      const response = await chatCompletion(providerConfig, messages);
      totalTokens += response.usage.inputTokens + response.usage.outputTokens;

      const parsed = config.parseResponse(response.content, batch);
      allResults.push(...parsed);
    } catch (error) {
      // Log but continue with remaining batches
      const message = error instanceof Error ? error.message : String(error);
      for (const file of batch) {
        allResults.push({
          file: file.relativePath,
          violations: [],
          summary: `AI analysis failed: ${message}`,
        });
      }
    }
  }

  return {
    results: allResults,
    providerUsed: providerConfig.provider,
    totalTokens,
    offline: false,
  };
}

/**
 * Build a scan result from AI analysis results
 */
export function buildAIScanResult(
  scannerId: string,
  analysisResults: AIAnalysisResult[],
  offline: boolean,
  providerUsed: string | null,
  totalTokens: number,
  duration: number,
  filesAnalyzed: number,
): ScanResult {
  const allViolations = analysisResults.flatMap((r) => r.violations);
  const errors = allViolations.filter((v) => v.severity === 'error');
  const warnings = allViolations.filter((v) => v.severity === 'warning');
  const infos = allViolations.filter((v) => v.severity === 'info');

  const status = offline
    ? 'skipped' as const
    : errors.length > 0
      ? 'fail' as const
      : warnings.length > 0
        ? 'warn' as const
        : 'pass' as const;

  const summaryParts: string[] = [];
  if (offline) {
    summaryParts.push('Skipped (no AI provider available)');
  } else {
    summaryParts.push(`Analyzed ${filesAnalyzed} files via ${providerUsed}`);
    if (errors.length > 0) summaryParts.push(`${errors.length} errors`);
    if (warnings.length > 0) summaryParts.push(`${warnings.length} warnings`);
    if (infos.length > 0) summaryParts.push(`${infos.length} info`);
    if (errors.length === 0 && warnings.length === 0) summaryParts.push('no issues found');
    summaryParts.push(`(${totalTokens} tokens)`);
  }

  return {
    scanner: scannerId,
    status,
    violations: allViolations.filter((v) => v.severity === 'error'),
    warnings: allViolations.filter((v) => v.severity !== 'error'),
    metrics: {
      filesAnalyzed,
      errors: errors.length,
      warnings: warnings.length,
      infos: infos.length,
      tokensUsed: totalTokens,
      offline: offline ? 1 : 0,
    },
    duration,
    timestamp: new Date().toISOString(),
    summary: summaryParts.join(' · '),
  };
}

/**
 * Parse a JSON array from LLM response, handling markdown fences
 */
export function parseJSONFromLLM<T>(response: string): T[] {
  // Strip markdown code fences if present
  let cleaned = response.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1]!.trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // Try line-by-line JSON object extraction
    const objects: T[] = [];
    const lines = cleaned.split('\n');
    let buffer = '';
    let depth = 0;

    for (const line of lines) {
      for (const char of line) {
        if (char === '{') depth++;
        if (char === '}') depth--;
      }
      buffer += line + '\n';
      if (depth === 0 && buffer.trim()) {
        try {
          objects.push(JSON.parse(buffer.trim()));
        } catch {
          // Skip malformed
        }
        buffer = '';
      }
    }

    return objects;
  }
}
