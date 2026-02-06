/**
 * Dependency Audit Scanner
 *
 * Runs `npm audit` across workspace packages to detect
 * known vulnerabilities in dependencies.
 *
 * @module @dcyfr/ai-cli/scanners/dependency-audit
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type { Scanner, ScanContext, ScanResult, ScanViolation } from './types.js';

const execFileAsync = promisify(execFile);

interface NpmAuditResult {
  vulnerabilities?: Record<
    string,
    {
      severity: string;
      name: string;
      via: unknown[];
      fixAvailable: boolean;
    }
  >;
  metadata?: {
    vulnerabilities: {
      info: number;
      low: number;
      moderate: number;
      high: number;
      critical: number;
      total: number;
    };
  };
}

export const dependencyAuditScanner: Scanner = {
  id: 'dependency-audit',
  name: 'Dependency Security Audit',
  description: 'Checks for known vulnerabilities in npm dependencies',
  category: 'security',

  async scan(context: ScanContext): Promise<ScanResult> {
    const start = Date.now();
    const violations: ScanViolation[] = [];
    const warnings: ScanViolation[] = [];

    try {
      // Run npm audit at workspace root (covers all workspaces)
      const { stdout } = await execFileAsync('npm', ['audit', '--json', '--audit-level=low'], {
        cwd: context.workspaceRoot,
        timeout: 30000,
      }).catch((err) => {
        // npm audit exits non-zero when vulnerabilities are found
        if (err.stdout) return { stdout: err.stdout as string };
        throw err;
      });

      let audit: NpmAuditResult;
      try {
        audit = JSON.parse(stdout) as NpmAuditResult;
      } catch {
        return {
          scanner: 'dependency-audit',
          status: 'error',
          violations: [],
          warnings: [],
          metrics: {},
          duration: Date.now() - start,
          timestamp: new Date().toISOString(),
          summary: 'Failed to parse npm audit output',
        };
      }

      const meta = audit.metadata?.vulnerabilities;
      const totalVulns = meta?.total ?? 0;

      if (audit.vulnerabilities) {
        for (const [name, vuln] of Object.entries(audit.vulnerabilities)) {
          const severity = vuln.severity as string;
          const violation: ScanViolation = {
            id: `vuln-${name}`,
            severity: severity === 'critical' || severity === 'high' ? 'error' : 'warning',
            message: `${severity} vulnerability in ${name}${vuln.fixAvailable ? ' (fix available)' : ''}`,
            fix: vuln.fixAvailable ? `Run: npm audit fix` : 'Manual review required',
            autoFixable: vuln.fixAvailable,
          };

          if (severity === 'critical' || severity === 'high') {
            violations.push(violation);
          } else {
            warnings.push(violation);
          }
        }
      }

      const status =
        (meta?.critical ?? 0) > 0 || (meta?.high ?? 0) > 0
          ? 'fail'
          : totalVulns > 0
            ? 'warn'
            : 'pass';

      return {
        scanner: 'dependency-audit',
        status,
        violations,
        warnings,
        metrics: {
          critical: meta?.critical ?? 0,
          high: meta?.high ?? 0,
          moderate: meta?.moderate ?? 0,
          low: meta?.low ?? 0,
          total: totalVulns,
        },
        duration: Date.now() - start,
        timestamp: new Date().toISOString(),
        summary:
          totalVulns === 0
            ? 'No known vulnerabilities found'
            : `${totalVulns} vulnerabilities (${meta?.critical ?? 0} critical, ${meta?.high ?? 0} high, ${meta?.moderate ?? 0} moderate, ${meta?.low ?? 0} low)`,
      };
    } catch (error) {
      return {
        scanner: 'dependency-audit',
        status: 'error',
        violations: [],
        warnings: [],
        metrics: {},
        duration: Date.now() - start,
        timestamp: new Date().toISOString(),
        summary: `npm audit failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
