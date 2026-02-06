/**
 * Daemon module barrel export
 *
 * @module @dcyfr/ai-cli/daemon
 */

export { DaemonProcess, readDaemonState, isDaemonRunning, stopDaemon, readDaemonLogs } from './process.js';
export { EventBus } from './events.js';
export { TaskQueue } from './queue.js';
export { Scheduler } from './scheduler.js';
export { FileWatcher } from './watcher.js';
export {
  rotateLogIfNeeded,
  getLogStorageSize,
  cleanRotatedLogs,
  readAllLogs,
  DEFAULT_LOG_ROTATION,
} from './log-rotation.js';
export type { LogRotationConfig } from './log-rotation.js';
export { NotificationManager, DEFAULT_NOTIFICATION_CONFIG } from './notifications.js';
export type { NotificationConfig, HealthChangeEvent } from './notifications.js';
export {
  generatePlist,
  installLaunchAgent,
  uninstallLaunchAgent,
  isLaunchAgentInstalled,
  readInstalledPlist,
} from './launchd.js';
export type {
  DaemonConfig,
  DaemonState,
  DaemonEvent,
  DaemonEventType,
  DaemonEventListener,
  Task,
  TaskStatus,
  TaskSource,
  ScheduleEntry,
  WatcherConfig,
  WatcherRule,
} from './types.js';
export { TaskPriority, DEFAULT_DAEMON_CONFIG, DEFAULT_SCHEDULES, DEFAULT_WATCHER_CONFIG } from './types.js';
