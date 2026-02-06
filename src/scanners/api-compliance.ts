/**
 * API Compliance Scanner (AI-Enhanced)
 *
 * Validates that API routes follow DCYFR patterns:
 * - Validate → Queue → Respond pattern for async routes (Inngest)
 * - Proper error handling with status codes
 * - Security headers and CORS configuration
 * - Input validation before processing
 * - No direct database calls in route handlers (use service layer)
 *
 * Falls back to static pattern matching when no LLM is available.
 *
 * @module @dcyfr/ai-cli/scanners/api-compliance
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
 * Patterns for detecting API compliance issues statically
 */
const PATTERNS = {
  /** Route handler exports */
  routeHandler: /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g,
  /** Inngest usage (async pattern compliance) */
  inngestSend: /inngest\.send\(/,
  /** Direct response with data (sync pattern) */
  jsonResponse: /NextResponse\.json\(/,
  /** Input validation */
  inputValidation: /(?:z\.object|zod\.object|schema\.parse|validate|isValid|safeParse)/i,
  /** Error handling */
  tryCatch: /try\s*{/,
  /** Status codes */
  statusCode: /status:\s*(\d{3})/g,
  /** Direct DB calls in route handlers */
  directDb: /(?:prisma|drizzle|db|pool|knex)\./,
  /** Security headers */
  securityHeaders: /(?:CORS|security.headers|x-frame-options|content-security-policy)/i,
};

async function staticApiScan(
  context: ScanContext,
  files: string[],
): Promise<ScanResult> {
  const start = Date.now();
  const violations: ScanViolation[] = [];
  let routesChecked = 0;
  let compliant = 0;

  for (const filePath of files) {
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    const relPath = relativePath(context.workspaceRoot, filePath);

    // Find route handlers in this file
    PATTERNS.routeHandler.lastIndex = 0;
    let match: RegExpExecArray | null;
    const handlers: string[] = [];

    while ((match = PATTERNS.routeHandler.exec(content)) !== null) {
      handlers.push(match[1]!);
    }

    if (handlers.length === 0) continue;

    routesChecked += handlers.length;
    let fileCompliant = true;

    for (const method of handlers) {
      const lineNum = content.slice(0, content.indexOf(`function ${method}`)).split('\n').length;

      // Check: POST/PUT/PATCH should use Validate → Queue → Respond
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        // Check for input validation
        if (!PATTERNS.inputValidation.test(content)) {
          fileCompliant = false;
          violations.push({
            id: 'missing-input-validation',
            severity: 'warning',
            message: `${method} handler missing input validation: ${relPath}`,
            file: relPath,
            line: lineNum,
            fix: 'Add request body validation (Zod schema recommended)',
          });
        }

        // Check for async work without Inngest
        if (!PATTERNS.inngestSend.test(content) && content.length > 500) {
          violations.push({
            id: 'missing-async-pattern',
            severity: 'info',
            message: `${method} handler may need Validate→Queue→Respond pattern: ${relPath}`,
            file: relPath,
            line: lineNum,
            fix: 'Consider using inngest.send() for async processing',
          });
        }
      }

      // Check: error handling
      if (!PATTERNS.tryCatch.test(content)) {
        fileCompliant = false;
        violations.push({
          id: 'missing-error-handling',
          severity: 'warning',
          message: `${method} handler missing try/catch error handling: ${relPath}`,
          file: relPath,
          line: lineNum,
          fix: 'Wrap handler logic in try/catch with proper error responses',
        });
      }
    }

    if (fileCompliant) {
      compliant += handlers.length;
    }
  }

  const compliance = routesChecked > 0 ? compliant / routesChecked : 1;
  const status = compliance >= 0.9 ? 'pass' : compliance >= 0.7 ? 'warn' : 'fail';

  return {
    scanner: 'api-compliance',
    status,
    violations: violations.filter((v) => v.severity === 'error'),
    warnings: violations.filter((v) => v.severity !== 'error'),
    metrics: {
      routesChecked,
      compliant,
      compliance: Math.round(compliance * 1000) / 10,
      aiPowered: 0,
    },
    duration: Date.now() - start,
    timestamp: new Date().toISOString(),
    summary: `${compliant}/${routesChecked} API routes compliant (${(compliance * 100).toFixed(1)}%) [static]`,
  };
}

// ---------------------------------------------------------------------------
// AI-enhanced analysis
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an API compliance reviewer for a DCYFR Next.js application.
Review API route handlers against these patterns:

**Required for mutation routes (POST/PUT/PATCH/DELETE):**
1. Validate → Queue → Respond pattern (use inngest.send() for async work)
2. Input validation (Zod schema or similar)  
3. Proper error handling with try/catch
4. Appropriate HTTP status codes (400 for validation, 401/403 for auth, 500 for server errors)

**Required for all routes:**
1. No direct database calls — use service layer functions
2. Security considerations (rate limiting mention, CORS)
3. TypeScript return types
4. Proper NextRequest/NextResponse usage

Respond with a JSON array:
[{
  "file": "relative/path/route.ts",
  "route": "POST /api/users",
  "issues": [{
    "rule": "validate-queue-respond|input-validation|error-handling|security|db-access|typing",
    "severity": "error|warning|info",
    "line": 15,
    "description": "The issue found",
    "fix": "How to fix it"
  }],
  "compliant": false
}]

Only report genuine compliance issues, not style preferences.`;

function buildUserPrompt(files: AnalysisFile[]): string {
  const fileBlocks = files.map((f) => `--- ${f.relativePath} ---\n${f.snippet}`).join('\n\n');
  return `Review these API route handlers for DCYFR pattern compliance:\n\n${fileBlocks}`;
}

interface LLMApiIssue {
  rule: string;
  severity: string;
  line: number;
  description: string;
  fix: string;
}

interface LLMApiResult {
  file: string;
  route: string;
  issues: LLMApiIssue[];
  compliant: boolean;
}

function parseResponse(response: string, _files: AnalysisFile[]): AIAnalysisResult[] {
  const parsed = parseJSONFromLLM<LLMApiResult>(response);

  return parsed.map((result) => ({
    file: result.file,
    violations: (result.issues ?? []).map((issue) => ({
      id: `api-${issue.rule}`,
      severity: (issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'info') as 'error' | 'warning' | 'info',
      message: `[${result.route}] ${issue.description}`,
      file: result.file,
      line: issue.line,
      fix: issue.fix,
    })),
    summary: result.compliant
      ? `${result.route} — compliant`
      : `${result.route} — ${(result.issues ?? []).length} issues`,
  }));
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

export const apiComplianceScanner: Scanner = {
  id: 'api-compliance',
  name: 'API Pattern Compliance (AI)',
  description: 'Validates API routes follow Validate→Queue→Respond and DCYFR patterns',
  category: 'compliance',
  projects: ['dcyfr-labs'],

  async scan(context: ScanContext): Promise<ScanResult> {
    const start = Date.now();

    // Find API route files
    const files =
      context.files ??
      (await discoverFiles(context.workspaceRoot, {
        extensions: ['.ts', '.tsx'],
        pathPattern: /\/api\//,
        ignore: ['node_modules', 'dist', '.next', '__tests__'],
      }));

    // Filter to only route files (route.ts/route.tsx)
    const routeFiles = files.filter((f) => f.endsWith('route.ts') || f.endsWith('route.tsx'));

    if (routeFiles.length === 0) {
      return {
        scanner: 'api-compliance',
        status: 'pass',
        violations: [],
        warnings: [],
        metrics: { routesChecked: 0, compliant: 0, compliance: 100 },
        duration: Date.now() - start,
        timestamp: new Date().toISOString(),
        summary: 'No API route files found',
      };
    }

    // Try AI analysis
    const aiResult = await runAIAnalysis(context, routeFiles, {
      systemPrompt: SYSTEM_PROMPT,
      buildUserPrompt,
      parseResponse,
      maxFileChars: 6000,
      batchSize: 3,
    });

    if (aiResult.offline) {
      return staticApiScan(context, routeFiles);
    }

    return buildAIScanResult(
      'api-compliance',
      aiResult.results,
      false,
      aiResult.providerUsed,
      aiResult.totalTokens,
      Date.now() - start,
      routeFiles.length,
    );
  },
};
