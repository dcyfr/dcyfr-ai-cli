/**
 * Code Smell Scanner (AI-Enhanced)
 *
 * Uses LLM to detect nuanced code quality issues:
 * - Overly complex functions (high cyclomatic complexity)
 * - God objects / files doing too much
 * - Deeply nested callbacks / promise chains
 * - Copy-paste / duplicated logic patterns
 * - Magic numbers and unclear naming
 * - Dead code and unused imports
 *
 * Falls back to static heuristics when no LLM is available.
 *
 * @module @dcyfr/ai-cli/scanners/code-smell
 */

import { readFile, stat } from 'fs/promises';
import { discoverFiles, relativePath } from '@/lib/files.js';
import {
  runAIAnalysis,
  buildAIScanResult,
  parseJSONFromLLM,
} from '@/ai/index.js';
import type { AnalysisFile, AIAnalysisResult } from '@/ai/index.js';
import type { Scanner, ScanContext, ScanResult, ScanViolation } from './types.js';

// ---------------------------------------------------------------------------
// Static heuristics (offline fallback)
// ---------------------------------------------------------------------------

interface FileMetrics {
  lineCount: number;
  functionCount: number;
  maxNestingDepth: number;
  longestFunction: number;
  magicNumbers: number;
}

function analyzeFileMetrics(content: string): FileMetrics {
  const lines = content.split('\n');
  let functionCount = 0;
  let maxNestingDepth = 0;
  let currentNesting = 0;
  let longestFunction = 0;
  let currentFunctionLength = 0;
  let inFunction = false;
  let magicNumbers = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Track nesting
    const opens = (trimmed.match(/{/g) || []).length;
    const closes = (trimmed.match(/}/g) || []).length;
    currentNesting += opens - closes;
    maxNestingDepth = Math.max(maxNestingDepth, currentNesting);

    // Count functions
    if (/(?:function\s+\w+|=>\s*{|(?:async\s+)?(?:function|method))/.test(trimmed)) {
      functionCount++;
      inFunction = true;
      currentFunctionLength = 0;
    }

    if (inFunction) {
      currentFunctionLength++;
      if (closes > opens && currentNesting <= 1) {
        longestFunction = Math.max(longestFunction, currentFunctionLength);
        inFunction = false;
      }
    }

    // Detect magic numbers (excluding 0, 1, -1, common array indices, and common sizes)
    const magicMatch = trimmed.match(/(?<![.\w])(?<!['"`])(\d{2,})(?![.\w])/g);
    if (magicMatch) {
      const skip = new Set(['10', '16', '100', '1000', '1024', '60', '24', '365']);
      for (const m of magicMatch) {
        if (!skip.has(m) && !/^\d{4}$/.test(m)) { // Skip years
          magicNumbers++;
        }
      }
    }
  }

  return {
    lineCount: lines.length,
    functionCount,
    maxNestingDepth,
    longestFunction,
    magicNumbers,
  };
}

async function staticCodeSmellScan(
  context: ScanContext,
  files: string[],
): Promise<ScanResult> {
  const start = Date.now();
  const violations: ScanViolation[] = [];
  let filesChecked = 0;
  let smellsFound = 0;

  for (const filePath of files) {
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    filesChecked++;
    const relPath = relativePath(context.workspaceRoot, filePath);
    const metrics = analyzeFileMetrics(content);

    // God file: >500 lines
    if (metrics.lineCount > 500) {
      smellsFound++;
      violations.push({
        id: 'god-file',
        severity: metrics.lineCount > 1000 ? 'error' : 'warning',
        message: `Large file (${metrics.lineCount} lines): ${relPath}`,
        file: relPath,
        fix: 'Consider splitting into smaller, focused modules',
      });
    }

    // Long function: >80 lines
    if (metrics.longestFunction > 80) {
      smellsFound++;
      violations.push({
        id: 'long-function',
        severity: metrics.longestFunction > 150 ? 'error' : 'warning',
        message: `Function with ${metrics.longestFunction} lines in ${relPath}`,
        file: relPath,
        fix: 'Extract sub-operations into helper functions',
      });
    }

    // Deep nesting: >5 levels
    if (metrics.maxNestingDepth > 5) {
      smellsFound++;
      violations.push({
        id: 'deep-nesting',
        severity: metrics.maxNestingDepth > 8 ? 'error' : 'warning',
        message: `Nesting depth of ${metrics.maxNestingDepth} in ${relPath}`,
        file: relPath,
        fix: 'Use early returns, extract conditions, or flatten with Promise.all',
      });
    }

    // Excessive file size (>50KB)
    try {
      const fileStat = await stat(filePath);
      if (fileStat.size > 50_000) {
        smellsFound++;
        violations.push({
          id: 'oversized-file',
          severity: 'warning',
          message: `File is ${Math.round(fileStat.size / 1024)}KB: ${relPath}`,
          file: relPath,
          fix: 'Large files are harder to maintain — consider splitting',
        });
      }
    } catch {
      // stat failed, skip
    }
  }

  const smellRate = filesChecked > 0 ? smellsFound / filesChecked : 0;
  const status = smellRate <= 0.05 ? 'pass' : smellRate <= 0.15 ? 'warn' : 'fail';

  return {
    scanner: 'code-smell',
    status,
    violations: violations.filter((v) => v.severity === 'error'),
    warnings: violations.filter((v) => v.severity !== 'error'),
    metrics: {
      filesChecked,
      smellsFound,
      smellRate: Math.round(smellRate * 1000) / 10,
      aiPowered: 0,
    },
    duration: Date.now() - start,
    timestamp: new Date().toISOString(),
    summary: `${smellsFound} code smells in ${filesChecked} files (${(smellRate * 100).toFixed(1)}%) [static]`,
  };
}

// ---------------------------------------------------------------------------
// AI-enhanced analysis
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a senior code quality reviewer for a TypeScript/Next.js project.
Analyze the code for code smells and quality issues. Focus on:
1. Functions that are too long or complex
2. God objects/files with too many responsibilities
3. Deep nesting or callback hell
4. Duplicated logic patterns
5. Unclear naming or magic values
6. Dead code or unnecessary complexity
7. Missing error handling
8. Inconsistent patterns

Respond with a JSON array:
[{
  "file": "relative/path.ts",
  "smells": [{
    "type": "long-function|deep-nesting|god-object|duplication|naming|dead-code|error-handling|complexity",
    "line": 42,
    "severity": "error|warning|info",
    "description": "Brief description of the issue",
    "suggestion": "How to fix it"
  }]
}]

Be selective — only report significant issues, not style preferences. Skip test files and configs.`;

function buildUserPrompt(files: AnalysisFile[]): string {
  const fileBlocks = files.map((f) => `--- ${f.relativePath} ---\n${f.snippet}`).join('\n\n');
  return `Review these files for code smells:\n\n${fileBlocks}`;
}

interface LLMSmell {
  type: string;
  line: number;
  severity: string;
  description: string;
  suggestion: string;
}

interface LLMSmellResult {
  file: string;
  smells: LLMSmell[];
}

function parseResponse(response: string, _files: AnalysisFile[]): AIAnalysisResult[] {
  const parsed = parseJSONFromLLM<LLMSmellResult>(response);

  return parsed.map((result) => ({
    file: result.file,
    violations: (result.smells ?? []).map((smell) => ({
      id: `ai-${smell.type}`,
      severity: (smell.severity === 'error' ? 'error' : smell.severity === 'warning' ? 'warning' : 'info') as 'error' | 'warning' | 'info',
      message: smell.description,
      file: result.file,
      line: smell.line,
      fix: smell.suggestion,
    })),
    summary: `${(result.smells ?? []).length} code smells detected`,
  }));
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

export const codeSmellScanner: Scanner = {
  id: 'code-smell',
  name: 'Code Smell Detection (AI)',
  description: 'AI-enhanced code smell and quality issue detection',
  category: 'compliance',

  async scan(context: ScanContext): Promise<ScanResult> {
    const start = Date.now();

    const files =
      context.files ??
      (await discoverFiles(context.workspaceRoot, {
        extensions: ['.ts', '.tsx'],
        ignore: [
          '__tests__', '*.test.*', '*.spec.*', 'node_modules',
          'dist', '.next', '*.d.ts', '*.config.*',
        ],
      }));

    // Try AI analysis first
    const aiResult = await runAIAnalysis(context, files, {
      systemPrompt: SYSTEM_PROMPT,
      buildUserPrompt,
      parseResponse,
      maxFileChars: 5000,
      batchSize: 5,
    });

    if (aiResult.offline) {
      return staticCodeSmellScan(context, files);
    }

    return buildAIScanResult(
      'code-smell',
      aiResult.results,
      false,
      aiResult.providerUsed,
      aiResult.totalTokens,
      Date.now() - start,
      files.length,
    );
  },
};
