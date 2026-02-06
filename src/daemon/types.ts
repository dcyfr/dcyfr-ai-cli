/**
 * Daemon type definitions
 *
 * Types for the daemon process manager, scheduler, file watcher,
 * task queue, and event bus.
 *
 * @module @dcyfr/ai-cli/daemon/types
 */

// ── Daemon Configuration ─────────────────────────────────────

/**
 * Daemon process configuration
 */
export interface DaemonConfig {
  /** Path to PID file (relative to workspace root) */
  pidFile: string;
  /** Path to log file (relative to workspace root) */
  logFile: string;
  /** Health heartbeat interval in ms */
  healthInterval: number;
  /** Maximum memory usage in MB before warning */
  maxMemoryMB: number;
  /** Time to wait for graceful shutdown in ms */
  gracefulShutdownTimeout: number;
  /** Enable file watcher */
  watcherEnabled: boolean;
  /** Enable scheduler */
  schedulerEnabled: boolean;
}

/**
 * Default daemon configuration
 */
export const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  pidFile: '.dcyfr/daemon.pid',
  logFile: '.dcyfr/daemon.log',
  healthInterval: 60_000,
  maxMemoryMB: 256,
  gracefulShutdownTimeout: 10_000,
  watcherEnabled: true,
  schedulerEnabled: true,
};

// ── Daemon State ─────────────────────────────────────────────

/**
 * Runtime state of the daemon process
 */
export interface DaemonState {
  /** Process ID */
  pid: number;
  /** ISO timestamp when daemon started */
  startedAt: string;
  /** Uptime in milliseconds */
  uptime: number;
  /** ISO timestamp of last heartbeat */
  lastHeartbeat: string;
  /** Total tasks completed since start */
  tasksCompleted: number;
  /** Tasks currently queued */
  tasksQueued: number;
  /** Current memory usage in MB */
  memoryUsageMB: number;
  /** Whether the scheduler is active */
  schedulerActive: boolean;
  /** Whether the watcher is active */
  watcherActive: boolean;
}

// ── Task Queue ───────────────────────────────────────────────

/**
 * Task priority levels (lower = higher priority)
 */
export enum TaskPriority {
  CRITICAL = 0,
  HIGH = 1,
  NORMAL = 2,
  LOW = 3,
}

/**
 * Task execution status
 */
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'expired';

/**
 * Source that triggered the task
 */
export type TaskSource = 'scheduler' | 'watcher' | 'cli';

/**
 * A unit of work in the task queue
 */
export interface Task {
  /** Unique task identifier */
  id: string;
  /** Scanner to invoke */
  scanner: string;
  /** Execution priority */
  priority: TaskPriority;
  /** How this task was triggered */
  source: TaskSource;
  /** Specific files to scan (undefined = full scan) */
  files?: string[] | undefined;
  /** Scanner-specific options */
  options?: Record<string, unknown> | undefined;
  /** ISO timestamp when task was created */
  createdAt: string;
  /** Current task status */
  status: TaskStatus;
  /** ISO timestamp when task started executing */
  startedAt?: string | undefined;
  /** ISO timestamp when task completed */
  completedAt?: string | undefined;
  /** Error message if task failed */
  error?: string | undefined;
}

// ── Scheduler ────────────────────────────────────────────────

/**
 * A scheduled scan entry
 */
export interface ScheduleEntry {
  /** Schedule identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Scanner ID to invoke */
  scanner: string;
  /** Interval between runs in ms */
  interval: number;
  /** Whether this schedule is active */
  enabled: boolean;
  /** ISO timestamp of last run */
  lastRun?: string | undefined;
  /** ISO timestamp of next scheduled run */
  nextRun?: string | undefined;
  /** Scanner-specific options */
  options?: Record<string, unknown> | undefined;
}

/**
 * Default scanner schedules
 */
export const DEFAULT_SCHEDULES: Omit<ScheduleEntry, 'lastRun' | 'nextRun'>[] = [
  { id: 'design-tokens', name: 'Design Token Compliance', scanner: 'design-tokens', interval: 3_600_000, enabled: true },
  { id: 'barrel-exports', name: 'Barrel Export Check', scanner: 'barrel-exports', interval: 3_600_000, enabled: true },
  { id: 'pagelayout', name: 'PageLayout Compliance', scanner: 'pagelayout', interval: 3_600_000, enabled: true },
  { id: 'license-headers', name: 'License Headers', scanner: 'license-headers', interval: 86_400_000, enabled: true },
  { id: 'tlp-headers', name: 'TLP Header Compliance', scanner: 'tlp-headers', interval: 86_400_000, enabled: true },
  { id: 'docs-structure', name: 'Documentation Structure', scanner: 'docs-structure', interval: 86_400_000, enabled: true },
  { id: 'dependency-audit', name: 'Dependency Audit', scanner: 'dependency-audit', interval: 86_400_000, enabled: true },
  { id: 'test-data-guardian', name: 'Test Data Guardian', scanner: 'test-data-guardian', interval: 86_400_000, enabled: true },
];

// ── File Watcher ─────────────────────────────────────────────

/**
 * File watcher configuration
 */
export interface WatcherConfig {
  /** Directories to watch (relative to workspace root) */
  roots: string[];
  /** Additional patterns to ignore */
  ignored: string[];
  /** Default debounce time in ms */
  debounceMs: number;
  /** Rules mapping file patterns to scanners */
  rules: WatcherRule[];
}

/**
 * Maps file change patterns to scanner invocations
 */
export interface WatcherRule {
  /** File pattern to match (regex) */
  pattern: RegExp;
  /** Scanner IDs to trigger */
  scanners: string[];
  /** Override debounce for this rule */
  debounceMs?: number | undefined;
}

/**
 * Default watcher configuration
 */
export const DEFAULT_WATCHER_CONFIG: WatcherConfig = {
  roots: [
    'dcyfr-labs/src',
    'dcyfr-ai/packages',
    'dcyfr-ai-agents/src',
    'dcyfr-ai-cli/src',
    'dcyfr-ai-chatbot/src',
    'dcyfr-ai-code-gen/src',
    'dcyfr-workspace-agents',
    'docs',
    'openspec',
    'scripts',
  ],
  ignored: [
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/.dcyfr/**',
    '**/coverage/**',
    '**/.turbo/**',
    '**/.vercel/**',
  ],
  debounceMs: 1000,
  rules: [
    {
      pattern: /dcyfr-labs\/src\/.*\.(tsx?|jsx?)$/,
      scanners: ['design-tokens', 'barrel-exports'],
      debounceMs: 2000,
    },
    {
      pattern: /dcyfr-labs\/src\/app\/.*\/page\.tsx$/,
      scanners: ['pagelayout'],
    },
    {
      pattern: /\.(ts|tsx|js|mjs)$/,
      scanners: ['license-headers'],
      debounceMs: 5000,
    },
    {
      pattern: /\.md$/,
      scanners: ['tlp-headers', 'docs-structure'],
    },
    {
      pattern: /package\.json$/,
      scanners: ['dependency-audit'],
      debounceMs: 10000,
    },
    {
      pattern: /\.(test|spec)\.(ts|tsx)$/,
      scanners: ['test-data-guardian'],
    },
  ],
};

// ── Event Bus ────────────────────────────────────────────────

/**
 * Event types emitted by daemon components
 */
export type DaemonEventType =
  | 'daemon:started'
  | 'daemon:stopping'
  | 'daemon:stopped'
  | 'daemon:heartbeat'
  | 'daemon:memory-warning'
  | 'task:queued'
  | 'task:started'
  | 'task:completed'
  | 'task:failed'
  | 'task:expired'
  | 'schedule:triggered'
  | 'schedule:updated'
  | 'watcher:change'
  | 'watcher:error'
  | 'scan:started'
  | 'scan:completed'
  | 'health:updated';

/**
 * Base daemon event
 */
export interface DaemonEvent {
  /** Event type */
  type: DaemonEventType;
  /** ISO timestamp */
  timestamp: string;
  /** Event payload */
  data: Record<string, unknown>;
}

/**
 * Event listener function
 */
export type DaemonEventListener = (event: DaemonEvent) => void;
