/**
 * macOS launchd integration for auto-starting the DCYFR daemon
 *
 * Generates, installs, and uninstalls a launchd plist that keeps
 * the daemon running as a user Launch Agent.
 *
 * @module @dcyfr/ai-cli/daemon/launchd
 */

import { writeFile, unlink, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { execFile } from 'child_process';
import { platform, homedir } from 'os';
import { pathExists } from '@/lib/files.js';

const PLIST_LABEL = 'com.dcyfr.daemon';
const PLIST_FILENAME = `${PLIST_LABEL}.plist`;

/**
 * Generate the launchd plist XML content
 */
export function generatePlist(workspaceRoot: string, nodePath: string, cliPath: string): string {
  const logDir = join(workspaceRoot, '.dcyfr');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${cliPath}</string>
        <string>daemon</string>
        <string>start</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${workspaceRoot}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>DCYFR_WORKSPACE</key>
        <string>${workspaceRoot}</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <key>ThrottleInterval</key>
    <integer>30</integer>

    <key>StandardOutPath</key>
    <string>${join(logDir, 'launchd-stdout.log')}</string>

    <key>StandardErrorPath</key>
    <string>${join(logDir, 'launchd-stderr.log')}</string>

    <key>ProcessType</key>
    <string>Background</string>

    <key>LowPriorityIO</key>
    <true/>

    <key>Nice</key>
    <integer>10</integer>
</dict>
</plist>`;
}

/**
 * Get the LaunchAgents directory for the current user
 */
function getLaunchAgentsDir(): string {
  return join(homedir(), 'Library', 'LaunchAgents');
}

/**
 * Get the full path to the plist file
 */
function getPlistPath(): string {
  return join(getLaunchAgentsDir(), PLIST_FILENAME);
}

/**
 * Install the daemon as a macOS Launch Agent
 */
export async function installLaunchAgent(workspaceRoot: string): Promise<{ success: boolean; message: string }> {
  if (platform() !== 'darwin') {
    return { success: false, message: 'launchd is only available on macOS' };
  }

  // Find node and CLI paths
  const nodePath = process.execPath;
  const cliPath = join(workspaceRoot, 'dcyfr-ai-cli', 'dist', 'cli.js');

  if (!(await pathExists(cliPath))) {
    return {
      success: false,
      message: `CLI not built. Run 'npm run build' in dcyfr-ai-cli/ first.\nExpected: ${cliPath}`,
    };
  }

  // Ensure LaunchAgents directory exists
  const agentsDir = getLaunchAgentsDir();
  if (!(await pathExists(agentsDir))) {
    await mkdir(agentsDir, { recursive: true });
  }

  // Generate and write plist
  const plistContent = generatePlist(workspaceRoot, nodePath, cliPath);
  const plistPath = getPlistPath();

  // Unload existing if present
  if (await pathExists(plistPath)) {
    await unloadAgent(plistPath);
  }

  await writeFile(plistPath, plistContent, 'utf-8');

  // Load the agent
  const loaded = await loadAgent(plistPath);
  if (!loaded) {
    return { success: false, message: `Plist written to ${plistPath} but failed to load` };
  }

  return {
    success: true,
    message: `Daemon installed as Launch Agent\n  Plist: ${plistPath}\n  Will auto-start on login and restart on crash`,
  };
}

/**
 * Uninstall the daemon Launch Agent
 */
export async function uninstallLaunchAgent(): Promise<{ success: boolean; message: string }> {
  if (platform() !== 'darwin') {
    return { success: false, message: 'launchd is only available on macOS' };
  }

  const plistPath = getPlistPath();

  if (!(await pathExists(plistPath))) {
    return { success: false, message: 'No Launch Agent installed' };
  }

  // Unload the agent
  await unloadAgent(plistPath);

  // Remove the plist file
  await unlink(plistPath);

  return {
    success: true,
    message: `Launch Agent uninstalled\n  Removed: ${plistPath}`,
  };
}

/**
 * Check if the Launch Agent is installed
 */
export async function isLaunchAgentInstalled(): Promise<{
  installed: boolean;
  plistPath: string;
  loaded: boolean;
}> {
  const plistPath = getPlistPath();
  const installed = await pathExists(plistPath);

  let loaded = false;
  if (installed) {
    loaded = await isAgentLoaded();
  }

  return { installed, plistPath, loaded };
}

/**
 * Get the current plist content (for inspection)
 */
export async function readInstalledPlist(): Promise<string | null> {
  const plistPath = getPlistPath();
  if (!(await pathExists(plistPath))) return null;

  try {
    return await readFile(plistPath, 'utf-8');
  } catch {
    return null;
  }
}

// ── Internal helpers ─────────────────────────────────────────

function loadAgent(plistPath: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    execFile('launchctl', ['load', '-w', plistPath], (error) => {
      resolve(!error);
    });
  });
}

function unloadAgent(plistPath: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    execFile('launchctl', ['unload', plistPath], (error) => {
      resolve(!error);
    });
  });
}

function isAgentLoaded(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    execFile('launchctl', ['list'], (error, stdout) => {
      if (error) {
        resolve(false);
        return;
      }
      resolve(stdout.includes(PLIST_LABEL));
    });
  });
}
