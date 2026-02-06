/**
 * `dcyfr daemon` command — daemon lifecycle management
 *
 * Subcommands:
 *   dcyfr daemon start [--background] [--no-watcher] [--no-scheduler]
 *   dcyfr daemon stop
 *   dcyfr daemon status [--json]
 *   dcyfr daemon logs [--lines N] [--follow]
 *
 * @module @dcyfr/ai-cli/commands/daemon
 */

import { Command } from 'commander';
import { spawn } from 'child_process';
import { findWorkspaceRoot } from '@/lib/workspace.js';
import {
  DaemonProcess,
  isDaemonRunning,
  stopDaemon,
  readDaemonState,
  readDaemonLogs,
} from '@/daemon/process.js';
import {
  installLaunchAgent,
  uninstallLaunchAgent,
  isLaunchAgentInstalled,
} from '@/daemon/launchd.js';

/**
 * Format uptime in human-readable form
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Create the `dcyfr daemon` command group
 */
export function createDaemonCommand(): Command {
  const daemon = new Command('daemon').description('Manage the DCYFR workspace guardian daemon');

  // ── daemon start ───────────────────────────────────────────

  daemon
    .command('start')
    .description('Start the daemon process')
    .option('--background', 'Run in background (detached)')
    .option('--no-watcher', 'Disable file watcher')
    .option('--no-scheduler', 'Disable scheduler')
    .action(async (options: { background?: boolean; watcher: boolean; scheduler: boolean }) => {
      const workspaceRoot = await findWorkspaceRoot();

      // Check if already running
      const { running, pid } = await isDaemonRunning(workspaceRoot);
      if (running) {
        console.log(`\n  ⚠️  Daemon is already running (PID: ${pid})`);
        console.log('  Use "dcyfr daemon stop" to stop it first.\n');
        return;
      }

      if (options.background) {
        // Background mode: spawn detached child process
        console.log('\n  🚀 Starting daemon in background...');

        const child = spawn(process.execPath, [process.argv[1]!, 'daemon', 'start'], {
          detached: true,
          stdio: 'ignore',
          env: {
            ...process.env,
            DCYFR_WORKSPACE: workspaceRoot,
            DCYFR_DAEMON_WATCHER: options.watcher ? '1' : '0',
            DCYFR_DAEMON_SCHEDULER: options.scheduler ? '1' : '0',
          },
        });

        child.unref();
        console.log(`  PID: ${child.pid}`);
        console.log('  Use "dcyfr daemon status" to check status');
        console.log('  Use "dcyfr daemon logs" to view output\n');
        return;
      }

      // Foreground mode
      console.log('\n  🚀 Starting DCYFR Workspace Guardian...\n');

      const daemon = new DaemonProcess(workspaceRoot, {
        watcherEnabled: options.watcher,
        schedulerEnabled: options.scheduler,
      });

      try {
        await daemon.start();

        // Keep process alive — daemon runs until signal received
        console.log('\n  Press Ctrl+C to stop the daemon.\n');
      } catch (error) {
        console.error(`\n  ❌ Failed to start daemon: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      }
    });

  // ── daemon stop ────────────────────────────────────────────

  daemon
    .command('stop')
    .description('Stop the running daemon')
    .action(async () => {
      const workspaceRoot = await findWorkspaceRoot();
      const { running, pid } = await isDaemonRunning(workspaceRoot);

      if (!running) {
        console.log('\n  ℹ️  Daemon is not running.\n');
        return;
      }

      console.log(`\n  Stopping daemon (PID: ${pid})...`);

      const stopped = await stopDaemon(workspaceRoot);
      if (stopped) {
        console.log('  ✅ Stop signal sent. Daemon will shut down gracefully.\n');

        // Wait briefly and confirm
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const { running: stillRunning } = await isDaemonRunning(workspaceRoot);
        if (stillRunning) {
          console.log('  ⏳ Daemon is still shutting down (draining tasks)...\n');
        } else {
          console.log('  ✅ Daemon stopped.\n');
        }
      } else {
        console.log('  ❌ Failed to send stop signal.\n');
      }
    });

  // ── daemon status ──────────────────────────────────────────

  daemon
    .command('status')
    .description('Show daemon status')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      const workspaceRoot = await findWorkspaceRoot();
      const { running, pid } = await isDaemonRunning(workspaceRoot);

      if (options.json) {
        const state = running ? await readDaemonState(workspaceRoot) : null;
        console.log(JSON.stringify({
          running,
          pid,
          state,
        }, null, 2));
        return;
      }

      console.log('');
      console.log('  DCYFR Daemon Status');
      console.log('  ─────────────────────────────────');

      if (!running) {
        console.log('  Status:     ⚫ Stopped');
        if (pid !== null) {
          console.log(`  Last PID:   ${pid} (stale)`);
        }
        console.log('');
        console.log('  Start with: dcyfr daemon start');
        console.log('');
        return;
      }

      console.log(`  Status:     🟢 Running`);
      console.log(`  PID:        ${pid}`);

      const state = await readDaemonState(workspaceRoot);
      if (state) {
        console.log(`  Uptime:     ${formatUptime(state.uptime)}`);
        console.log(`  Memory:     ${state.memoryUsageMB} MB`);
        console.log(`  Scheduler:  ${state.schedulerActive ? '🟢 Active' : '⚫ Inactive'}`);
        console.log(`  Watcher:    ${state.watcherActive ? '🟢 Active' : '⚫ Inactive'}`);
        console.log(`  Tasks Done: ${state.tasksCompleted}`);
        console.log(`  Queued:     ${state.tasksQueued}`);
      }

      console.log('');
    });

  // ── daemon logs ────────────────────────────────────────────

  daemon
    .command('logs')
    .description('View daemon logs')
    .option('-n, --lines <count>', 'Number of lines to show', '50')
    .option('-f, --follow', 'Follow log output (tail -f)')
    .action(async (options: { lines: string; follow?: boolean }) => {
      const workspaceRoot = await findWorkspaceRoot();
      const lineCount = parseInt(options.lines, 10);

      const logs = await readDaemonLogs(workspaceRoot, lineCount);

      if (logs.length === 0) {
        console.log('\n  ℹ️  No daemon logs found.\n');
        return;
      }

      console.log('');
      for (const line of logs) {
        // Colorize log levels
        const colored = line
          .replace(/ERROR/, '\x1b[31mERROR\x1b[0m')
          .replace(/WARN /, '\x1b[33mWARN \x1b[0m')
          .replace(/INFO /, '\x1b[36mINFO \x1b[0m')
          .replace(/DEBUG/, '\x1b[90mDEBUG\x1b[0m');
        console.log(`  ${colored}`);
      }
      console.log('');

      if (options.follow) {
        console.log('  (following logs — press Ctrl+C to stop)\n');

        // Simple follow mode: poll for new lines
        let lastLength = logs.length;
        const interval = setInterval(async () => {
          const newLogs = await readDaemonLogs(workspaceRoot, 200);
          if (newLogs.length > lastLength) {
            const newLines = newLogs.slice(lastLength);
            for (const line of newLines) {
              const colored = line
                .replace(/ERROR/, '\x1b[31mERROR\x1b[0m')
                .replace(/WARN /, '\x1b[33mWARN \x1b[0m')
                .replace(/INFO /, '\x1b[36mINFO \x1b[0m')
                .replace(/DEBUG/, '\x1b[90mDEBUG\x1b[0m');
              console.log(`  ${colored}`);
            }
            lastLength = newLogs.length;
          }
        }, 1000);

        // Keep alive until signal
        process.on('SIGINT', () => {
          clearInterval(interval);
          console.log('\n');
          process.exit(0);
        });

        // Keep process alive
        await new Promise(() => {}); // never resolves
      }
    });

  // ── daemon install ─────────────────────────────────────────

  daemon
    .command('install')
    .description('Install daemon as macOS Launch Agent (auto-start on login)')
    .action(async () => {
      const workspaceRoot = await findWorkspaceRoot();

      console.log('\n  Installing DCYFR daemon as Launch Agent...\n');

      const result = await installLaunchAgent(workspaceRoot);
      if (result.success) {
        console.log(`  ✅ ${result.message}\n`);
      } else {
        console.log(`  ❌ ${result.message}\n`);
        process.exit(1);
      }
    });

  // ── daemon uninstall ───────────────────────────────────────

  daemon
    .command('uninstall')
    .description('Uninstall daemon Launch Agent')
    .action(async () => {
      console.log('\n  Uninstalling DCYFR daemon Launch Agent...\n');

      const result = await uninstallLaunchAgent();
      if (result.success) {
        console.log(`  ✅ ${result.message}\n`);
      } else {
        console.log(`  ❌ ${result.message}\n`);
        process.exit(1);
      }
    });

  // ── daemon agent-status ────────────────────────────────────

  daemon
    .command('agent-status')
    .description('Show Launch Agent installation status')
    .action(async () => {
      const agentInfo = await isLaunchAgentInstalled();

      console.log('');
      console.log('  DCYFR Launch Agent Status');
      console.log('  ─────────────────────────────────');
      console.log(`  Installed: ${agentInfo.installed ? '✅ Yes' : '❌ No'}`);
      if (agentInfo.installed) {
        console.log(`  Plist:     ${agentInfo.plistPath}`);
        console.log(`  Loaded:    ${agentInfo.loaded ? '🟢 Active' : '⚫ Inactive'}`);
      }
      console.log('');
    });

  return daemon;
}
