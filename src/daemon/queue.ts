/**
 * Priority Task Queue — deduplication, priority ordering, rate limiting
 *
 * Manages the execution pipeline for scanner tasks, ensuring
 * proper ordering, deduplication of redundant scans, and
 * concurrency control.
 *
 * @module @dcyfr/ai-cli/daemon/queue
 */

import { randomUUID } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { pathExists } from '@/lib/files.js';
import { EventBus } from './events.js';
import { TaskPriority } from './types.js';
import type { Task, TaskSource } from './types.js';
import type { ScanContext } from '@/scanners/types.js';
import type { ScannerRegistry } from '@/scanners/registry.js';

const QUEUE_FILE = '.dcyfr/queue.json';
const TASK_TTL_MS = 3_600_000; // 1 hour

/**
 * Task queue configuration
 */
export interface QueueConfig {
  /** Maximum concurrent tasks */
  maxConcurrent: number;
  /** Task time-to-live in ms */
  taskTTL: number;
  /** Enable queue state persistence */
  persist: boolean;
}

const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxConcurrent: 1,
  taskTTL: TASK_TTL_MS,
  persist: true,
};

/**
 * Priority task queue with deduplication and rate limiting
 */
export class TaskQueue {
  private queue: Task[] = [];
  private running = new Map<string, Task>();
  private completed: Task[] = [];
  private processing = false;
  private config: QueueConfig;
  private workspaceRoot: string;
  private events: EventBus;
  private registry: ScannerRegistry;

  constructor(
    workspaceRoot: string,
    registry: ScannerRegistry,
    events: EventBus,
    config: Partial<QueueConfig> = {},
  ) {
    this.workspaceRoot = workspaceRoot;
    this.registry = registry;
    this.events = events;
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
  }

  /**
   * Enqueue a new task. Returns the task ID, or null if deduplicated.
   */
  enqueue(
    scanner: string,
    source: TaskSource,
    priority: TaskPriority = TaskPriority.NORMAL,
    files?: string[],
    options?: Record<string, unknown>,
  ): string | null {
    // Deduplicate: skip if same scanner + same files already queued
    const isDuplicate = this.queue.some(
      (t) => t.scanner === scanner && t.status === 'queued' && this.sameFiles(t.files, files),
    );
    if (isDuplicate) {
      return null;
    }

    // Also skip if the same scanner is currently running (unless different files)
    const isRunning = this.running.has(scanner) && this.sameFiles(this.running.get(scanner)!.files, files);
    if (isRunning) {
      return null;
    }

    const task: Task = {
      id: randomUUID(),
      scanner,
      priority,
      source,
      files,
      options,
      createdAt: new Date().toISOString(),
      status: 'queued',
    };

    this.queue.push(task);
    this.sortQueue();
    this.events.emit('task:queued', { taskId: task.id, scanner, source, priority });
    void this.persistState();

    // Start processing if not already running
    if (!this.processing) {
      void this.processNext();
    }

    return task.id;
  }

  /**
   * Process the next task in the queue
   */
  private async processNext(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        // Expire stale tasks
        this.expireStaleTasks();

        // Find next queued task
        const taskIndex = this.queue.findIndex((t) => t.status === 'queued');
        if (taskIndex === -1) break;

        // Check concurrency limit
        if (this.running.size >= this.config.maxConcurrent) break;

        const task = this.queue[taskIndex]!;

        // Move to running
        task.status = 'running';
        task.startedAt = new Date().toISOString();
        this.queue.splice(taskIndex, 1);
        this.running.set(task.scanner, task);
        this.events.emit('task:started', { taskId: task.id, scanner: task.scanner });

        try {
          const context: ScanContext = {
            workspaceRoot: this.workspaceRoot,
            files: task.files,
            options: task.options,
          };

          const result = await this.registry.run(task.scanner, context);
          task.status = 'completed';
          task.completedAt = new Date().toISOString();
          this.events.emit('task:completed', {
            taskId: task.id,
            scanner: task.scanner,
            status: result.status,
            duration: result.duration,
          });
          this.events.emit('scan:completed', { result });
        } catch (error) {
          task.status = 'failed';
          task.completedAt = new Date().toISOString();
          task.error = error instanceof Error ? error.message : String(error);
          this.events.emit('task:failed', {
            taskId: task.id,
            scanner: task.scanner,
            error: task.error,
          });
        }

        // Move to completed history
        this.running.delete(task.scanner);
        this.completed.push(task);
        if (this.completed.length > 100) {
          this.completed = this.completed.slice(-50);
        }

        void this.persistState();
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Expire tasks older than TTL
   */
  private expireStaleTasks(): void {
    const now = Date.now();
    for (const task of this.queue) {
      if (task.status === 'queued') {
        const age = now - new Date(task.createdAt).getTime();
        if (age > this.config.taskTTL) {
          task.status = 'expired';
          this.events.emit('task:expired', { taskId: task.id, scanner: task.scanner });
        }
      }
    }
    this.queue = this.queue.filter((t) => t.status !== 'expired');
  }

  /**
   * Sort queue by priority (lower number = higher priority)
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Check if two file arrays represent the same set
   */
  private sameFiles(a: string[] | undefined, b: string[] | undefined): boolean {
    if (a === undefined && b === undefined) return true;
    if (a === undefined || b === undefined) return false;
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort((x, y) => x.localeCompare(y));
    const sortedB = [...b].sort((x, y) => x.localeCompare(y));
    return sortedA.every((f, i) => f === sortedB[i]);
  }

  /**
   * Persist queue state to disk for crash recovery
   */
  private async persistState(): Promise<void> {
    if (!this.config.persist) return;

    try {
      const dir = join(this.workspaceRoot, '.dcyfr');
      if (!(await pathExists(dir))) {
        await mkdir(dir, { recursive: true });
      }

      const state = {
        queue: this.queue.filter((t) => t.status === 'queued'),
        lastUpdated: new Date().toISOString(),
      };

      await writeFile(join(this.workspaceRoot, QUEUE_FILE), JSON.stringify(state, null, 2));
    } catch {
      // Non-fatal: queue persistence failure
    }
  }

  /**
   * Restore queue state from disk
   */
  async restore(): Promise<number> {
    const filePath = join(this.workspaceRoot, QUEUE_FILE);
    if (!(await pathExists(filePath))) return 0;

    try {
      const raw = await readFile(filePath, 'utf-8');
      const state = JSON.parse(raw) as { queue: Task[] };
      let restored = 0;

      for (const task of state.queue) {
        // Only restore tasks that aren't too old
        const age = Date.now() - new Date(task.createdAt).getTime();
        if (age < this.config.taskTTL) {
          task.status = 'queued';
          this.queue.push(task);
          restored++;
        }
      }

      this.sortQueue();
      return restored;
    } catch {
      return 0;
    }
  }

  /**
   * Get queue statistics
   */
  stats(): { queued: number; running: number; completed: number; failed: number } {
    return {
      queued: this.queue.filter((t) => t.status === 'queued').length,
      running: this.running.size,
      completed: this.completed.filter((t) => t.status === 'completed').length,
      failed: this.completed.filter((t) => t.status === 'failed').length,
    };
  }

  /**
   * Get total tasks completed (including from completed history)
   */
  totalCompleted(): number {
    return this.completed.filter((t) => t.status === 'completed').length;
  }

  /**
   * Get the number of queued tasks
   */
  size(): number {
    return this.queue.filter((t) => t.status === 'queued').length;
  }

  /**
   * Clear all queued tasks
   */
  clear(): void {
    this.queue = [];
    void this.persistState();
  }

  /**
   * Drain: wait for all currently running tasks to complete
   */
  async drain(): Promise<void> {
    while (this.running.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Get a recent scan result from the completed tasks
   * (Only available if the event bus captured it)
   */
  recentResults(): Task[] {
    return [...this.completed].reverse().slice(0, 20);
  }
}
