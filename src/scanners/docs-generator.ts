/**
 * Docs Generator Scanner (AI-Enhanced)
 *
 * Uses LLM to detect missing or inadequate documentation:
 * - Exported functions/classes without JSDoc
 * - Files without module-level documentation
 * - Complex functions lacking parameter descriptions
 * - README files that are stale or incomplete
 *
 * Falls back to static analysis when no LLM is available.
 *
 * @module @dcyfr/ai-cli/scanners/docs-generator
 */

import { readFile } from 'fs/promises';
import { discoverFiles, relativePath } from '@/lib/files.js';
import {
  runAIAnalysis,
  buildAIScanResult,
  parseJSONFromLLM,
} from '@/ai/index.js';
import type { AnalysisFile, AIAnalysisResult } from '@/ai/index.js';
import type { Scanner, ScanContext, ScanResult, ScanViolation } from './types.js';

// ---------------------------------------------------------------------------
// Static analysis (offline fallback)
// ---------------------------------------------------------------------------

/**
 * Patterns that detect missing documentation statically
 */
const EXPORT_PATTERN = /^export\s+(?:async\s+)?(?:function|class|const|let|type|interface|enum)\s+(\w+)/gm;
const JSDOC_PATTERN = /\/\*\*[\s\S]*?\*\//;

/**
 * Run static analysis for missing docs
 */
async function staticDocsScan(
  context: ScanContext,
  files: string[],
): Promise<ScanResult> {
  const start = Date.now();
  const violations: ScanViolation[] = [];
  let filesChecked = 0;
  let exportsChecked = 0;
  let undocumentedExports = 0;

  for (const filePath of files) {
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    filesChecked++;
    const relPath = relativePath(context.workspaceRoot, filePath);
    const lines = content.split('\n');

    // Find exported symbols without preceding JSDoc
    let match: RegExpExecArray | null;
    EXPORT_PATTERN.lastIndex = 0;

    while ((match = EXPORT_PATTERN.exec(content)) !== null) {
      exportsChecked++;
      const exportName = match[1]!;
      const matchIndex = match.index;

      // Check for JSDoc in the 5 lines before the export
      const lineNum = content.slice(0, matchIndex).split('\n').length;
      const precedingLines = lines.slice(Math.max(0, lineNum - 6), lineNum - 1).join('\n');

      if (!JSDOC_PATTERN.test(precedingLines)) {
        undocumentedExports++;
        violations.push({
          id: 'missing-jsdoc',
          severity: 'warning',
          message: `Exported "${exportName}" has no JSDoc documentation`,
          file: relPath,
          line: lineNum,
          fix: `Add /** ... */ documentation above "${exportName}"`,
        });
      }
    }

    // Check for module-level documentation (first 10 lines should have a comment block)
    const head = lines.slice(0, 10).join('\n');
    if (!JSDOC_PATTERN.test(head) && !head.includes('//')) {
      violations.push({
        id: 'missing-module-doc',
        severity: 'info',
        message: `File has no module-level documentation: ${relPath}`,
        file: relPath,
        line: 1,
        fix: 'Add a module-level JSDoc comment at the top of the file',
      });
    }
  }

  const docRate = exportsChecked > 0 ? (exportsChecked - undocumentedExports) / exportsChecked : 1;
  const status = docRate >= 0.8 ? 'pass' : docRate >= 0.5 ? 'warn' : 'fail';

  return {
    scanner: 'docs-generator',
    status,
    violations: violations.filter((v) => v.severity === 'error'),
    warnings: violations.filter((v) => v.severity !== 'error'),
    metrics: {
      filesChecked,
      exportsChecked,
      undocumentedExports,
      documentationRate: Math.round(docRate * 1000) / 10,
      aiPowered: 0,
    },
    duration: Date.now() - start,
    timestamp: new Date().toISOString(),
    summary: `${exportsChecked - undocumentedExports}/${exportsChecked} exports documented (${(docRate * 100).toFixed(1)}%) [static]`,
  };
}

// ---------------------------------------------------------------------------
// AI-enhanced analysis
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a documentation quality analyst for a TypeScript/Next.js codebase.
Analyze the code files for documentation issues. For each file, identify:
1. Exported symbols (functions, classes, types) missing JSDoc comments
2. Complex functions (>15 lines) without parameter/return documentation
3. Module-level documentation gaps (missing @module tag)

Respond with a JSON array of findings:
[{
  "file": "relative/path.ts",
  "issues": [{
    "symbol": "functionName",
    "line": 42,
    "severity": "warning",
    "issue": "Missing JSDoc for exported function",
    "suggestion": "Add description of purpose and parameters"
  }]
}]

Only report genuine documentation gaps. Skip test files, generated files, and config files.
Be concise — focus on the highest-impact gaps.`;

function buildUserPrompt(files: AnalysisFile[]): string {
  const fileBlocks = files.map((f) => `--- ${f.relativePath} ---\n${f.snippet}`).join('\n\n');
  return `Analyze these files for documentation quality:\n\n${fileBlocks}`;
}

interface LLMDocIssue {
  symbol: string;
  line: number;
  severity: string;
  issue: string;
  suggestion: string;
}

interface LLMDocResult {
  file: string;
  issues: LLMDocIssue[];
}

function parseResponse(response: string, _files: AnalysisFile[]): AIAnalysisResult[] {
  const parsed = parseJSONFromLLM<LLMDocResult>(response);

  return parsed.map((result) => ({
    file: result.file,
    violations: (result.issues ?? []).map((issue) => ({
      id: 'ai-missing-docs',
      severity: (issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'info') as 'error' | 'warning' | 'info',
      message: `${issue.issue}: ${issue.symbol}`,
      file: result.file,
      line: issue.line,
      fix: issue.suggestion,
    })),
    summary: `${(result.issues ?? []).length} documentation gaps found`,
  }));
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

export const docsGeneratorScanner: Scanner = {
  id: 'docs-generator',
  name: 'Documentation Quality (AI)',
  description: 'AI-enhanced detection of missing or inadequate documentation',
  category: 'documentation',

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
      maxFileChars: 4000,
      batchSize: 8,
    });

    if (aiResult.offline) {
      // Fall back to static analysis
      return staticDocsScan(context, files);
    }

    return buildAIScanResult(
      'docs-generator',
      aiResult.results,
      false,
      aiResult.providerUsed,
      aiResult.totalTokens,
      Date.now() - start,
      files.length,
    );
  },
};
