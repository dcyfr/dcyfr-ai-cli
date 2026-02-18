/**
 * Daemon File Watcher — reactive file system monitoring
 *
 * Watches for file changes and triggers targeted scanner invocations
 * based on configurable file-to-scanner mapping rules.
 *
 * Uses chokidar for cross-platform file watching with debouncing
 * to batch rapid changes.
 *
 * @module @dcyfr/ai-cli/daemon/watcher
 */

import { watch } from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { relative } from 'path';
import { EventBus } from './events.js';
import { TaskQueue } from './queue.js';
import { TaskPriority, DEFAULT_WATCHER_CONFIG } from './types.js';
import type { WatcherConfig, WatcherRule } from './types.js';

/**
 * Debounced file change batch
 */
interface ChangeBatch {
  files: Set<string>;
  scanners: Set<string>;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Reactive file watcher that maps file changes to scanner invocations
 */
export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private workspaceRoot: string;
  private queue: TaskQueue;
  private events: EventBus;
  private config: WatcherConfig;
  private batches = new Map<string, ChangeBatch>();
  private started = false;

  constructor(
    workspaceRoot: string,
    queue: TaskQueue,
    events: EventBus,
    config: Partial<WatcherConfig> = {},
  ) {
    this.workspaceRoot = workspaceRoot;
    this.queue = queue;
    this.events = events;
    this.config = { ...DEFAULT_WATCHER_CONFIG, ...config };
  }

  /**
   * Start watching the workspace for file changes
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const watchPaths = this.config.roots.map((root) =>
      root === '.' ? this.workspaceRoot : `${this.workspaceRoot}/${root}`,
    );

    this.watcher = watch(watchPaths, {
      ignored: this.config.ignored,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    this.watcher.on('change', (filePath: string) => this.handleChange(filePath));
    this.watcher.on('add', (filePath: string) => this.handleChange(filePath));
    this.watcher.on('unlink', (filePath: string) => this.handleChange(filePath));
    this.watcher.on('error', (error: unknown) => {
      this.events.emit('watcher:error', { error: error instanceof Error ? error.message : String(error) });
    });

    // Wait for the watcher to be ready
    await new Promise<void>((resolve) => {
      this.watcher!.on('ready', resolve);
    });
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    this.started = false;

    // Clear any pending debounce timers
    for (const batch of this.batches.values()) {
      clearTimeout(batch.timer);
    }
    this.batches.clear();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Handle a file change event
   */
  private handleChange(filePath: string): void {
    const relativePath = relative(this.workspaceRoot, filePath);

    this.events.emit('watcher:change', { file: relativePath });

    // Find matching rules
    const matchingRules = this.findMatchingRules(relativePath);
    if (matchingRules.length === 0) return;

    // Batch changes per scanner combination
    for (const rule of matchingRules) {
      const debounceMs = rule.debounceMs ?? this.config.debounceMs;
      const batchKey = rule.scanners.sort((a, b) => a.localeCompare(b)).join('+');

      const existing = this.batches.get(batchKey);
      if (existing) {
        // Add file to existing batch & reset timer
        existing.files.add(filePath);
        clearTimeout(existing.timer);
        existing.timer = setTimeout(() => this.flushBatch(batchKey), debounceMs);
      } else {
        // Create new batch
        const files = new Set<string>([filePath]);
        const scanners = new Set<string>(rule.scanners);
        const timer = setTimeout(() => this.flushBatch(batchKey), debounceMs);
        this.batches.set(batchKey, { files, scanners, timer });
      }
    }
  }

  /**
   * Flush a debounced batch — enqueue scanner tasks for accumulated file changes
   */
  private flushBatch(batchKey: string): void {
    const batch = this.batches.get(batchKey);
    if (!batch) return;

    this.batches.delete(batchKey);

    const files = Array.from(batch.files);
    for (const scanner of batch.scanners) {
      this.queue.enqueue(
        scanner,
        'watcher',
        TaskPriority.HIGH, // Reactive changes are high priority
        files,
      );
    }
  }

  /**
   * Find watcher rules that match a file path
   */
  private findMatchingRules(relativePath: string): WatcherRule[] {
    return this.config.rules.filter((rule) => rule.pattern.test(relativePath));
  }

  /**
   * Check if watcher is running
   */
  isRunning(): boolean {
    return this.started && this.watcher !== null;
  }

  /**
   * Get count of pending debounced batches
   */
  pendingBatches(): number {
    return this.batches.size;
  }
}
