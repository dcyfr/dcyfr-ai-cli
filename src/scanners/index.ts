/**
 * Scanner barrel export
 *
 * @module @dcyfr/ai-cli/scanners
 */

export type {
  Scanner,
  ScanContext,
  ScanResult,
  ScanViolation,
  FixResult,
  ScannerCategory,
  ScanStatus,
  ViolationSeverity,
  ScannerHealthEntry,
  HealthSnapshot,
} from './types.js';

export { ScannerRegistry, createDefaultRegistry } from './registry.js';
export { designTokensScanner } from './design-tokens.js';
export { barrelExportsScanner } from './barrel-exports.js';
export { pageLayoutScanner } from './pagelayout.js';
export { licenseHeadersScanner } from './license-headers.js';
export { tlpHeadersScanner } from './tlp-headers.js';
export { docsStructureScanner } from './docs-structure.js';
export { dependencyAuditScanner } from './dependency-audit.js';
export { testDataGuardianScanner } from './test-data-guardian.js';
export { docsGeneratorScanner } from './docs-generator.js';
export { codeSmellScanner } from './code-smell.js';
export { apiComplianceScanner } from './api-compliance.js';
