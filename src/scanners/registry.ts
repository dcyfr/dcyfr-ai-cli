/**
 * Scanner Registry — central registry for all scanner implementations
 *
 * @module @dcyfr/ai-cli/scanners/registry
 */

import type { Scanner, ScanContext, ScanResult, ScannerCategory } from './types.js';

/**
 * Central scanner registry
 */
export class ScannerRegistry {
  private scanners = new Map<string, Scanner>();

  /**
   * Register a scanner
   */
  register(scanner: Scanner): void {
    if (this.scanners.has(scanner.id)) {
      throw new Error(`Scanner '${scanner.id}' is already registered`);
    }
    this.scanners.set(scanner.id, scanner);
  }

  /**
   * Get a scanner by ID
   */
  get(id: string): Scanner | undefined {
    return this.scanners.get(id);
  }

  /**
   * Get all registered scanners
   */
  all(): Scanner[] {
    return Array.from(this.scanners.values());
  }

  /**
   * Get scanners by category
   */
  byCategory(category: ScannerCategory): Scanner[] {
    return this.all().filter((s) => s.category === category);
  }

  /**
   * Get scanners applicable to a specific project
   */
  forProject(project: string): Scanner[] {
    return this.all().filter((s) => !s.projects || s.projects.includes(project));
  }

  /**
   * List scanner IDs
   */
  ids(): string[] {
    return Array.from(this.scanners.keys());
  }

  /**
   * Run a single scanner
   */
  async run(id: string, context: ScanContext): Promise<ScanResult> {
    const scanner = this.scanners.get(id);
    if (!scanner) {
      throw new Error(`Scanner '${id}' not found. Available: ${this.ids().join(', ')}`);
    }
    return scanner.scan(context);
  }

  /**
   * Run all applicable scanners
   */
  async runAll(context: ScanContext): Promise<ScanResult[]> {
    const scanners = context.project ? this.forProject(context.project) : this.all();

    const results: ScanResult[] = [];
    for (const scanner of scanners) {
      try {
        const result = await scanner.scan(context);
        results.push(result);
      } catch (error) {
        results.push({
          scanner: scanner.id,
          status: 'error',
          violations: [],
          warnings: [],
          metrics: {},
          duration: 0,
          timestamp: new Date().toISOString(),
          summary: `Scanner error: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    return results;
  }
}

/**
 * Create the default registry with all built-in scanners
 */
export async function createDefaultRegistry(): Promise<ScannerRegistry> {
  const registry = new ScannerRegistry();

  // Import and register all scanners
  const { designTokensScanner } = await import('./design-tokens.js');
  const { barrelExportsScanner } = await import('./barrel-exports.js');
  const { pageLayoutScanner } = await import('./pagelayout.js');
  const { licenseHeadersScanner } = await import('./license-headers.js');
  const { tlpHeadersScanner } = await import('./tlp-headers.js');
  const { docsStructureScanner } = await import('./docs-structure.js');
  const { dependencyAuditScanner } = await import('./dependency-audit.js');
  const { testDataGuardianScanner } = await import('./test-data-guardian.js');
  const { docsGeneratorScanner } = await import('./docs-generator.js');
  const { codeSmellScanner } = await import('./code-smell.js');
  const { apiComplianceScanner } = await import('./api-compliance.js');

  registry.register(designTokensScanner);
  registry.register(barrelExportsScanner);
  registry.register(pageLayoutScanner);
  registry.register(licenseHeadersScanner);
  registry.register(tlpHeadersScanner);
  registry.register(docsStructureScanner);
  registry.register(dependencyAuditScanner);
  registry.register(testDataGuardianScanner);
  registry.register(docsGeneratorScanner);
  registry.register(codeSmellScanner);
  registry.register(apiComplianceScanner);

  return registry;
}
