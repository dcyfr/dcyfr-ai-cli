/**
 * Daemon Scheduler — cron-style task scheduling
 *
 * Manages periodic scanner invocations with persisted last-run times,
 * catch-up on restart, and jitter to avoid thundering herd.
 *
 * @module @dcyfr/ai-cli/daemon/scheduler
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { pathExists } from '@/lib/files.js';
import { EventBus } from './events.js';
import { TaskQueue } from './queue.js';
import { TaskPriority, DEFAULT_SCHEDULES } from './types.js';
import type { ScheduleEntry } from './types.js';

const SCHEDULES_FILE = '.dcyfr/schedules.json';

/**
 * Scheduler manages periodic scanner invocations
 */
export class Scheduler {
  private schedules: ScheduleEntry[] = [];
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private workspaceRoot: string;
  private queue: TaskQueue;
  private events: EventBus;
  private started = false;

  constructor(workspaceRoot: string, queue: TaskQueue, events: EventBus) {
    this.workspaceRoot = workspaceRoot;
    this.queue = queue;
    this.events = events;
  }

  /**
   * Initialize schedules from disk or defaults
   */
  async init(): Promise<void> {
    await this.loadSchedules();
  }

  /**
   * Start all enabled schedules
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    await this.loadSchedules();
    await this.catchUp();

    for (const schedule of this.schedules) {
      if (schedule.enabled) {
        this.startSchedule(schedule);
      }
    }
  }

  /**
   * Stop all schedules
   */
  stop(): void {
    this.started = false;
    for (const [id, timer] of this.timers) {
      clearInterval(timer);
      this.timers.delete(id);
    }
  }

  /**
   * Start a single schedule timer
   */
  private startSchedule(schedule: ScheduleEntry): void {
    // Add jitter (0-10% of interval) to avoid thundering herd
    const jitter = Math.random() * schedule.interval * 0.1;
    const firstDelay = this.getTimeUntilNextRun(schedule) + jitter;

    // Set initial timeout, then switch to interval
    const initialTimeout = setTimeout(() => {
      void this.triggerSchedule(schedule);

      // Now set the regular interval
      const intervalTimer = setInterval(() => {
        void this.triggerSchedule(schedule);
      }, schedule.interval);

      this.timers.set(schedule.id, intervalTimer);
    }, Math.max(firstDelay, 1000));

    // Store the initial timeout as an interval (close enough for cleanup)
    this.timers.set(schedule.id, initialTimeout as unknown as ReturnType<typeof setInterval>);
  }

  /**
   * Trigger a scheduled scan
   */
  private async triggerSchedule(schedule: ScheduleEntry): Promise<void> {
    this.events.emit('schedule:triggered', {
      scheduleId: schedule.id,
      scanner: schedule.scanner,
    });

    this.queue.enqueue(
      schedule.scanner,
      'scheduler',
      TaskPriority.NORMAL,
      undefined,
      schedule.options,
    );

    // Update last run time
    schedule.lastRun = new Date().toISOString();
    schedule.nextRun = new Date(Date.now() + schedule.interval).toISOString();

    await this.saveSchedules();
  }

  /**
   * Calculate time until next run for a schedule
   */
  private getTimeUntilNextRun(schedule: ScheduleEntry): number {
    if (!schedule.lastRun) {
      // Never run — run soon (within 30 seconds)
      return Math.random() * 30_000;
    }

    const timeSinceLastRun = Date.now() - new Date(schedule.lastRun).getTime();
    const remaining = schedule.interval - timeSinceLastRun;

    return Math.max(remaining, 0);
  }

  /**
   * Catch up on overdue schedules after restart
   */
  private async catchUp(): Promise<void> {
    for (const schedule of this.schedules) {
      if (!schedule.enabled || !schedule.lastRun) continue;

      const timeSinceLastRun = Date.now() - new Date(schedule.lastRun).getTime();
      if (timeSinceLastRun > schedule.interval) {
        // Overdue — enqueue immediately
        this.queue.enqueue(
          schedule.scanner,
          'scheduler',
          TaskPriority.LOW, // Lower priority for catch-up
          undefined,
          schedule.options,
        );

        schedule.lastRun = new Date().toISOString();
        schedule.nextRun = new Date(Date.now() + schedule.interval).toISOString();
      }
    }

    await this.saveSchedules();
  }

  /**
   * Load schedules from disk, merging with defaults
   */
  private async loadSchedules(): Promise<void> {
    const filePath = join(this.workspaceRoot, SCHEDULES_FILE);

    if (await pathExists(filePath)) {
      try {
        const raw = await readFile(filePath, 'utf-8');
        const saved = JSON.parse(raw) as ScheduleEntry[];

        // Merge saved state with defaults (add new scanners, preserve lastRun)
        this.schedules = DEFAULT_SCHEDULES.map((defaults) => {
          const saved_ = saved.find((s) => s.id === defaults.id);
          return {
            ...defaults,
            lastRun: saved_?.lastRun,
            nextRun: saved_?.nextRun,
            enabled: saved_?.enabled ?? defaults.enabled,
          };
        });
      } catch {
        this.schedules = DEFAULT_SCHEDULES.map((s) => ({ ...s }));
      }
    } else {
      this.schedules = DEFAULT_SCHEDULES.map((s) => ({ ...s }));
    }
  }

  /**
   * Persist schedule state to disk
   */
  private async saveSchedules(): Promise<void> {
    try {
      const dir = join(this.workspaceRoot, '.dcyfr');
      if (!(await pathExists(dir))) {
        await mkdir(dir, { recursive: true });
      }

      await writeFile(
        join(this.workspaceRoot, SCHEDULES_FILE),
        JSON.stringify(this.schedules, null, 2),
      );
    } catch {
      // Non-fatal: schedule persistence failure
    }
  }

  /**
   * Get all schedules
   */
  getSchedules(): ScheduleEntry[] {
    return [...this.schedules];
  }

  /**
   * Enable or disable a specific schedule
   */
  async setEnabled(id: string, enabled: boolean): Promise<boolean> {
    const schedule = this.schedules.find((s) => s.id === id);
    if (!schedule) return false;

    schedule.enabled = enabled;

    if (this.started) {
      if (enabled && !this.timers.has(id)) {
        this.startSchedule(schedule);
      } else if (!enabled && this.timers.has(id)) {
        clearInterval(this.timers.get(id)!);
        this.timers.delete(id);
      }
    }

    this.events.emit('schedule:updated', { scheduleId: id, enabled });
    await this.saveSchedules();
    return true;
  }

  /**
   * Check if the scheduler is running
   */
  isRunning(): boolean {
    return this.started;
  }

  /**
   * Get count of active (enabled) schedules
   */
  activeCount(): number {
    return this.schedules.filter((s) => s.enabled).length;
  }
}
