/**
 * Notification hooks for health status changes
 *
 * Supports:
 * - Terminal bell
 * - macOS native notifications (osascript)
 * - Webhook POST (Slack, Discord, etc.)
 *
 * @module @dcyfr/ai-cli/daemon/notifications
 */

import { execFile } from 'child_process';
import { platform } from 'os';

/**
 * Notification configuration
 */
export interface NotificationConfig {
  /** Enable terminal bell on health degradation */
  terminalBell: boolean;
  /** Enable macOS native notifications */
  osNotification: boolean;
  /** Optional webhook URL for POST notifications */
  webhookUrl?: string | undefined;
  /** Minimum health score change to trigger notification */
  threshold: number;
  /** Cooldown between notifications in ms (default: 5 min) */
  cooldownMs: number;
}

/**
 * Default notification config
 */
export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  terminalBell: true,
  osNotification: true,
  threshold: 10,
  cooldownMs: 5 * 60 * 1000, // 5 minutes
};

/**
 * Health change event that triggers notifications
 */
export interface HealthChangeEvent {
  /** Previous health score */
  previousScore: number;
  /** Current health score */
  currentScore: number;
  /** Previous status */
  previousStatus: 'healthy' | 'degraded' | 'critical';
  /** Current status */
  currentStatus: 'healthy' | 'degraded' | 'critical';
  /** Summary of changes */
  summary: string;
}

/**
 * Notification manager — rate-limited, multi-channel notifications
 */
export class NotificationManager {
  private config: NotificationConfig;
  private lastNotificationAt = 0;

  constructor(config: Partial<NotificationConfig> = {}) {
    this.config = { ...DEFAULT_NOTIFICATION_CONFIG, ...config };
  }

  /**
   * Process a health change event and send notifications if needed
   */
  async notify(event: HealthChangeEvent): Promise<void> {
    // Check cooldown
    const now = Date.now();
    if (now - this.lastNotificationAt < this.config.cooldownMs) {
      return;
    }

    // Check threshold
    const diff = Math.abs(event.currentScore - event.previousScore);
    if (diff < this.config.threshold) {
      return;
    }

    // Determine if this is a degradation or improvement
    const isDegradation = event.currentScore < event.previousScore;

    // Only notify on degradation by default
    if (!isDegradation && event.currentStatus !== 'critical') {
      return;
    }

    this.lastNotificationAt = now;

    const title = isDegradation
      ? `⚠️ DCYFR Health Degraded`
      : `✅ DCYFR Health Improved`;
    const body = `${event.previousScore.toFixed(1)}% → ${event.currentScore.toFixed(1)}% (${event.currentStatus})\n${event.summary}`;

    // Fire notifications in parallel (non-blocking)
    const promises: Promise<void>[] = [];

    if (this.config.terminalBell) {
      promises.push(this.sendTerminalBell());
    }

    if (this.config.osNotification) {
      promises.push(this.sendOSNotification(title, body));
    }

    if (this.config.webhookUrl) {
      promises.push(this.sendWebhook(title, body, event));
    }

    await Promise.allSettled(promises);
  }

  /**
   * Terminal bell (BEL character)
   */
  private async sendTerminalBell(): Promise<void> {
    process.stdout.write('\x07');
  }

  /**
   * macOS native notification via osascript
   */
  private async sendOSNotification(title: string, body: string): Promise<void> {
    if (platform() !== 'darwin') return;

    return new Promise<void>((resolve) => {
      const script = `display notification "${escapeAppleScript(body)}" with title "${escapeAppleScript(title)}" sound name "Glass"`;

      execFile('osascript', ['-e', script], (error) => {
        if (error) {
          // Non-fatal — notification is best-effort
        }
        resolve();
      });
    });
  }

  /**
   * Webhook POST (Slack, Discord, generic)
   */
  private async sendWebhook(
    title: string,
    body: string,
    event: HealthChangeEvent,
  ): Promise<void> {
    if (!this.config.webhookUrl) return;

    try {
      const payload = {
        text: `${title}\n${body}`,
        username: 'DCYFR Workspace Guardian',
        embeds: [
          {
            title,
            description: body,
            color: event.currentStatus === 'critical' ? 0xff0000 : event.currentStatus === 'degraded' ? 0xffaa00 : 0x00ff00,
            fields: [
              { name: 'Previous', value: `${event.previousScore.toFixed(1)}%`, inline: true },
              { name: 'Current', value: `${event.currentScore.toFixed(1)}%`, inline: true },
              { name: 'Status', value: event.currentStatus, inline: true },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      };

      await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Non-fatal — webhook is best-effort
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Escape special characters for AppleScript strings
 */
function escapeAppleScript(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}
