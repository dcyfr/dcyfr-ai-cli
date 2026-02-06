/**
 * Health module barrel export
 *
 * @module @dcyfr/ai-cli/health
 */

export {
  calculateHealthScore,
  buildHealthSnapshot,
  saveHealthSnapshot,
  loadHealthSnapshot,
  loadHealthHistory,
} from './state.js';

export { renderHealthDashboard, renderScanResults, renderScanResultsJson } from './dashboard.js';

export {
  sparkline,
  colorSparkline,
  calculateTrend,
  renderSparklineHistory,
} from './sparkline.js';
