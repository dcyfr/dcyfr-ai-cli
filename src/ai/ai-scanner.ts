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
 * Determine scan status based on violation counts
 */
function determineScanStatus(
  offline: boolean,
  errorCount: number,
  warningCount: number,
): 'skipped' | 'fail' | 'warn' | 'pass' {
  if (offline) return 'skipped';
  if (errorCount > 0) return 'fail';
  if (warningCount > 0) return 'warn';
  return 'pass';
}

/**
 * Build summary text for scan result
 */
function buildScanSummary(
  offline: boolean,
  filesAnalyzed: number,
  providerUsed: string | null,
  errorCount: number,
  warningCount: number,
  infoCount: number,
  totalTokens: number,
): string {
  if (offline) {
    return 'Skipped (no AI provider available)';
  }

  const parts: string[] = [];
  parts.push(`Analyzed ${filesAnalyzed} files via ${providerUsed}`);
  if (errorCount > 0) parts.push(`${errorCount} errors`);
  if (warningCount > 0) parts.push(`${warningCount} warnings`);
  if (infoCount > 0) parts.push(`${infoCount} info`);
  if (errorCount === 0 && warningCount === 0) parts.push('no issues found');
  parts.push(`(${totalTokens} tokens)`);
  return parts.join(' · ');
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

  const status = determineScanStatus(offline, errors.length, warnings.length);
  const summary = buildScanSummary(
    offline,
    filesAnalyzed,
    providerUsed,
    errors.length,
    warnings.length,
    infos.length,
    totalTokens,
  );

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
    summary,
  };
}

/**
 * Extract JSON objects line-by-line from malformed response
 */
function extractJSONObjectsLineByLine<T>(text: string): T[] {
  const objects: T[] = [];
  const lines = text.split('\n');
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
    return extractJSONObjectsLineByLine<T>(cleaned);
  }
}
