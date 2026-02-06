/**
 * Daemon Process Manager — lifecycle, signals, health, logging
 *
 * Orchestrates the daemon's components: scheduler, file watcher,
 * task queue, and event bus. Manages PID files, signal handling,
 * graceful shutdown, health heartbeats, and log output.
 *
 * @module @dcyfr/ai-cli/daemon/process
 */

import { readFile, writeFile, unlink, mkdir, appendFile } from 'fs/promises';
import { join } from 'path';
import { pathExists } from '@/lib/files.js';
import { createDefaultRegistry } from '@/scanners/registry.js';
import { buildHealthSnapshot, saveHealthSnapshot } from '@/health/state.js';
import { rotateLogIfNeeded } from './log-rotation.js';
import { NotificationManager } from './notifications.js';
import { EventBus } from './events.js';
import { TaskQueue } from './queue.js';
import { Scheduler } from './scheduler.js';
import { FileWatcher } from './watcher.js';
import { DEFAULT_DAEMON_CONFIG } from './types.js';
import type { DaemonConfig, DaemonState } from './types.js';
import type { ScanResult } from '@/scanners/types.js';

const DCYFR_DIR = '.dcyfr';

/**
 * Daemon process manager — the central orchestrator
 */
export class DaemonProcess {
  private workspaceRoot: string;
  private config: DaemonConfig;
  private events: EventBus;
  private queue!: TaskQueue;
  private scheduler!: Scheduler;
  private watcher!: FileWatcher;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private startedAt: string | null = null;
  private tasksCompleted = 0;
  private running = false;
  private scanResults: ScanResult[] = [];
  private signalHandlers: Array<{ signal: string; handler: () => void }> = [];
  private notifications: NotificationManager;
  private lastHealthScore = 0;
  private lastHealthStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';

  constructor(workspaceRoot: string, config: Partial<DaemonConfig> = {}) {
    this.workspaceRoot = workspaceRoot;
    this.config = { ...DEFAULT_DAEMON_CONFIG, ...config };
    this.events = new EventBus();
    this.notifications = new NotificationManager();
  }

  /**
   * Start the daemon process (foreground)
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Daemon is already running');
    }

    // Check for existing daemon
    const existingPid = await this.readPidFile();
    if (existingPid !== null) {
      if (this.isProcessAlive(existingPid)) {
        throw new Error(`Daemon is already running (PID: ${existingPid})`);
      }
      // Stale PID file — clean up
      await this.removePidFile();
    }

    this.running = true;
    this.startedAt = new Date().toISOString();

    // Ensure .dcyfr directory exists
    await this.ensureDcyfrDir();

    // Write PID file
    await this.writePidFile();

    // Initialize components
    const registry = await createDefaultRegistry();

    this.queue = new TaskQueue(this.workspaceRoot, registry, this.events);
    this.scheduler = new Scheduler(this.workspaceRoot, this.queue, this.events);
    this.watcher = new FileWatcher(this.workspaceRoot, this.queue, this.events);

    // Restore any persisted queue state
    const restored = await this.queue.restore();
    if (restored > 0) {
      this.log('info', `Restored ${restored} tasks from queue`);
    }

    // Set up event listeners
    this.setupEventListeners();

    // Set up signal handlers for graceful shutdown
    this.setupSignalHandlers();

    // Start heartbeat
    this.startHeartbeat();

    // Log startup
    this.log('info', `Daemon started (PID: ${process.pid})`);
    this.log('info', `Workspace: ${this.workspaceRoot}`);
    this.events.emit('daemon:started', { pid: process.pid });

    // Start scheduler
    if (this.config.schedulerEnabled) {
      await this.scheduler.start();
      this.log('info', `Scheduler started (${this.scheduler.activeCount()} schedules active)`);
    }

    // Start file watcher
    if (this.config.watcherEnabled) {
      await this.watcher.start();
      this.log('info', 'File watcher started');
    }

    this.log('info', 'Daemon is ready — monitoring workspace');
  }

  /**
   * Stop the daemon gracefully
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    this.log('info', 'Shutting down daemon...');
    this.events.emit('daemon:stopping', {});

    // Stop accepting new tasks
    this.running = false;

    // Stop scheduler
    this.scheduler.stop();
    this.log('info', 'Scheduler stopped');

    // Stop watcher
    await this.watcher.stop();
    this.log('info', 'File watcher stopped');

    // Drain running tasks with timeout
    const drainTimeout = setTimeout(() => {
      this.log('warn', 'Drain timeout reached — forcing shutdown');
    }, this.config.gracefulShutdownTimeout);

    await this.queue.drain();
    clearTimeout(drainTimeout);

    // Save final health snapshot
    await this.saveHealth();

    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Clean up event listeners
    this.events.clear();

    // Remove signal handlers
    this.removeSignalHandlers();

    // Remove PID file
    await this.removePidFile();

    this.log('info', 'Daemon stopped');
    this.events.emit('daemon:stopped', {});
  }

  /**
   * Get current daemon state
   */
  getState(): DaemonState {
    const mem = process.memoryUsage();
    return {
      pid: process.pid,
      startedAt: this.startedAt ?? new Date().toISOString(),
      uptime: this.startedAt ? Date.now() - new Date(this.startedAt).getTime() : 0,
      lastHeartbeat: new Date().toISOString(),
      tasksCompleted: this.tasksCompleted,
      tasksQueued: this.queue?.size() ?? 0,
      memoryUsageMB: Math.round(mem.heapUsed / 1024 / 1024),
      schedulerActive: this.scheduler?.isRunning() ?? false,
      watcherActive: this.watcher?.isRunning() ?? false,
    };
  }

  /**
   * Check if daemon is running
   */
  isRunning(): boolean {
    return this.running;
  }

  // ── Signal Handling ──────────────────────────────────────────

  private setupSignalHandlers(): void {
    const shutdownHandler = () => {
      void this.stop().then(() => process.exit(0));
    };

    const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'];
    for (const signal of signals) {
      const handler = () => shutdownHandler();
      process.on(signal, handler);
      this.signalHandlers.push({ signal, handler });
    }
  }

  private removeSignalHandlers(): void {
    for (const { signal, handler } of this.signalHandlers) {
      process.removeListener(signal, handler);
    }
    this.signalHandlers = [];
  }

  // ── Event Listeners ──────────────────────────────────────────

  private setupEventListeners(): void {
    // Track task completions
    this.events.on('task:completed', (event) => {
      this.tasksCompleted++;
      this.log('info', `Task completed: ${event.data['scanner']} (${event.data['duration']}ms)`);
    });

    this.events.on('task:failed', (event) => {
      this.log('error', `Task failed: ${event.data['scanner']} — ${event.data['error']}`);
    });

    this.events.on('task:queued', (event) => {
      this.log('debug', `Task queued: ${event.data['scanner']} (source: ${event.data['source']})`);
    });

    // Capture scan results for health tracking
    this.events.on('scan:completed', (event) => {
      const result = event.data['result'] as ScanResult;
      // Replace or append scan result
      const idx = this.scanResults.findIndex((r) => r.scanner === result.scanner);
      if (idx >= 0) {
        this.scanResults[idx] = result;
      } else {
        this.scanResults.push(result);
      }
    });

    this.events.on('schedule:triggered', (event) => {
      this.log('debug', `Schedule triggered: ${event.data['scanner']}`);
    });

    this.events.on('watcher:change', (event) => {
      this.log('debug', `File changed: ${event.data['file']}`);
    });

    this.events.on('watcher:error', (event) => {
      this.log('error', `Watcher error: ${event.data['error']}`);
    });

    // Memory monitoring
    this.events.on('daemon:heartbeat', () => {
      const mem = process.memoryUsage();
      const usageMB = Math.round(mem.heapUsed / 1024 / 1024);
      if (usageMB > this.config.maxMemoryMB) {
        this.log('warn', `Memory usage high: ${usageMB}MB (limit: ${this.config.maxMemoryMB}MB)`);
        this.events.emit('daemon:memory-warning', { usageMB, limitMB: this.config.maxMemoryMB });
      }
    });
  }

  // ── Heartbeat ────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const state = this.getState();
      this.events.emit('daemon:heartbeat', { ...state } as unknown as Record<string, unknown>);
      void this.writeHeartbeat();
      // Check for log rotation on each heartbeat
      void this.checkLogRotation();
    }, this.config.healthInterval);
  }

  private async writeHeartbeat(): Promise<void> {
    try {
      const state = this.getState();
      const filePath = join(this.workspaceRoot, DCYFR_DIR, 'daemon-state.json');
      await writeFile(filePath, JSON.stringify(state, null, 2));
    } catch {
      // Non-fatal
    }
  }

  // ── Health ───────────────────────────────────────────────────

  private async saveHealth(): Promise<void> {
    if (this.scanResults.length === 0) return;

    try {
      const snapshot = buildHealthSnapshot(this.scanResults);
      await saveHealthSnapshot(this.workspaceRoot, snapshot);
      this.log('info', `Health snapshot saved (score: ${snapshot.overall.score}%)`);

      // Notify on health changes
      const previousScore = this.lastHealthScore;
      const previousStatus = this.lastHealthStatus;
      this.lastHealthScore = snapshot.overall.score;
      this.lastHealthStatus = snapshot.overall.status;

      if (previousScore !== 0) {
        await this.notifications.notify({
          previousScore,
          currentScore: snapshot.overall.score,
          previousStatus,
          currentStatus: snapshot.overall.status,
          summary: `${this.scanResults.length} scanners evaluated`,
        });
      }
    } catch {
      // Non-fatal
    }
  }

  // ── Log Rotation ─────────────────────────────────────────────

  private async checkLogRotation(): Promise<void> {
    try {
      const logPath = join(this.workspaceRoot, this.config.logFile);
      const rotated = await rotateLogIfNeeded(logPath);
      if (rotated) {
        this.log('info', 'Log file rotated');
      }
    } catch {
      // Non-fatal
    }
  }

  // ── PID File Management ──────────────────────────────────────

  private async writePidFile(): Promise<void> {
    const filePath = join(this.workspaceRoot, this.config.pidFile);
    await writeFile(filePath, String(process.pid));
  }

  private async removePidFile(): Promise<void> {
    const filePath = join(this.workspaceRoot, this.config.pidFile);
    try {
      await unlink(filePath);
    } catch {
      // Already removed
    }
  }

  private async readPidFile(): Promise<number | null> {
    const filePath = join(this.workspaceRoot, this.config.pidFile);
    if (!(await pathExists(filePath))) return null;

    try {
      const content = await readFile(filePath, 'utf-8');
      const pid = parseInt(content.trim(), 10);
      return isNaN(pid) ? null : pid;
    } catch {
      return null;
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  // ── Directory Management ─────────────────────────────────────

  private async ensureDcyfrDir(): Promise<void> {
    const dir = join(this.workspaceRoot, DCYFR_DIR);
    if (!(await pathExists(dir))) {
      await mkdir(dir, { recursive: true });
    }
  }

  // ── Logging ──────────────────────────────────────────────────

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    const timestamp = new Date().toISOString();
    const prefix = level.toUpperCase().padEnd(5);
    const line = `[${timestamp}] ${prefix} ${message}`;

    // Console output
    switch (level) {
      case 'error':
        console.error(line);
        break;
      case 'warn':
        console.warn(line);
        break;
      case 'debug':
        // Only log debug when running in foreground
        if (process.stdout.isTTY) {
          console.log(`\x1b[90m${line}\x1b[0m`);
        }
        break;
      default:
        console.log(line);
    }

    // Also append to log file (async, non-blocking)
    void this.appendLog(line);
  }

  private async appendLog(line: string): Promise<void> {
    try {
      const logPath = join(this.workspaceRoot, this.config.logFile);
      await appendFile(logPath, line + '\n');
    } catch {
      // Non-fatal
    }
  }
}

// ── External Daemon Status Checking ────────────────────────────

/**
 * Read daemon state from disk (called externally, e.g., by `dcyfr daemon status`)
 */
export async function readDaemonState(workspaceRoot: string): Promise<DaemonState | null> {
  const stateFile = join(workspaceRoot, DCYFR_DIR, 'daemon-state.json');
  if (!(await pathExists(stateFile))) return null;

  try {
    const raw = await readFile(stateFile, 'utf-8');
    return JSON.parse(raw) as DaemonState;
  } catch {
    return null;
  }
}

/**
 * Check if daemon is currently running by reading PID file
 */
export async function isDaemonRunning(workspaceRoot: string, pidFile = '.dcyfr/daemon.pid'): Promise<{ running: boolean; pid: number | null }> {
  const filePath = join(workspaceRoot, pidFile);
  if (!(await pathExists(filePath))) return { running: false, pid: null };

  try {
    const content = await readFile(filePath, 'utf-8');
    const pid = parseInt(content.trim(), 10);
    if (isNaN(pid)) return { running: false, pid: null };

    // Check if process is alive
    try {
      process.kill(pid, 0);
      return { running: true, pid };
    } catch {
      return { running: false, pid };
    }
  } catch {
    return { running: false, pid: null };
  }
}

/**
 * Send stop signal to running daemon
 */
export async function stopDaemon(workspaceRoot: string, pidFile = '.dcyfr/daemon.pid'): Promise<boolean> {
  const { running, pid } = await isDaemonRunning(workspaceRoot, pidFile);
  if (!running || pid === null) return false;

  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

/**
 * Read daemon log file (last N lines)
 */
export async function readDaemonLogs(
  workspaceRoot: string,
  lines = 50,
  logFile = '.dcyfr/daemon.log',
): Promise<string[]> {
  const filePath = join(workspaceRoot, logFile);
  if (!(await pathExists(filePath))) return [];

  try {
    const content = await readFile(filePath, 'utf-8');
    const allLines = content.split('\n').filter((l) => l.trim().length > 0);
    return allLines.slice(-lines);
  } catch {
    return [];
  }
}
