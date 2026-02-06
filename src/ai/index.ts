/**
 * AI module
 *
 * @module @dcyfr/ai-cli/ai
 */

export {
  resolveProvider,
  checkProviderStatus,
  chatCompletion,
  saveProviderConfig,
} from './provider.js';
export type {
  AIProviderType,
  AIProviderConfig,
  AIMessage,
  AIResponse,
  AIProviderStatus,
} from './provider.js';

export {
  runAIAnalysis,
  buildAIScanResult,
  parseJSONFromLLM,
} from './ai-scanner.js';
export type {
  AnalysisFile,
  AIAnalysisResult,
  AIScannerConfig,
} from './ai-scanner.js';
