<!-- TLP:CLEAR -->
# DCYFR CLI — Command Reference

**Information Classification:** TLP:CLEAR (Public)  
**Last Updated:** February 5, 2026

Complete command reference for `@dcyfr/ai-cli` — the DCYFR Workspace Guardian.

---

## Global Usage

```bash
dcyfr <command> [options]

# Development mode (from dcyfr-ai-cli/)
npx tsx src/cli.ts <command> [options]
```

---

## Commands

### `dcyfr scan` — Workspace Scanner

Run compliance, security, and quality scanners across the workspace.

```bash
dcyfr scan                    # Run all scanners
dcyfr scan design-tokens      # Run specific scanner
dcyfr scan --quick            # Quick mode (fewer files)
dcyfr scan --project dcyfr-labs  # Scan specific project
dcyfr scan --verbose          # Show violations detail
dcyfr scan --json             # Machine-readable output
dcyfr scan --no-save          # Don't save health snapshot
dcyfr scan list               # List available scanners
```

**Available Scanners (11):**

| Scanner | Category | Description |
|---------|----------|-------------|
| `design-tokens` | compliance | Design token usage vs hardcoded values |
| `barrel-exports` | compliance | Component directory barrel export coverage |
| `pagelayout` | compliance | PageLayout component usage in pages |
| `license-headers` | governance | MIT license header on source files |
| `tlp-headers` | documentation | TLP classification on markdown files |
| `docs-structure` | documentation | Documentation organization in `docs/` dirs |
| `dependency-audit` | security | npm audit for known vulnerabilities |
| `test-data-guardian` | security | Detect secrets/PII in test files |
| `docs-generator` | documentation | Missing JSDoc/module documentation (AI) |
| `code-smell` | cleanup | God files, long functions, deep nesting (AI) |
| `api-compliance` | compliance | Validate→Queue→Respond API patterns (AI) |

---

### `dcyfr health` — Health Dashboard

Display the workspace health score and per-scanner breakdown.

```bash
dcyfr health                  # Show health dashboard
dcyfr health --json           # JSON output
dcyfr health history          # Trend report with sparklines
dcyfr health history --days 7 # Last 7 days
dcyfr health history --json   # History as JSON
```

**Dashboard Output:**
```
┌──────────────────────────────────────────────────────┐
│               DCYFR Workspace Health                 │
├──────────────────────┬────────┬──────────────────────┤
│ Scanner              │ Score  │ Status               │
├──────────────────────┼────────┼──────────────────────┤
│ Design Tokens        │  61.8% │ ❌ 2900 err          │
│ TLP Headers          │ 100.0% │ ✅ clean             │
│ ...                  │        │                      │
├──────────────────────┼────────┼──────────────────────┤
│ OVERALL              │  54.3% │ 🔴 CRITICAL          │
└──────────────────────┴────────┴──────────────────────┘
```

**Sparkline History Output:**
```
╔══════════════════════════════════════════════════════════╗
║           DCYFR Health History — Trend Report           ║
╚══════════════════════════════════════════════════════════╝

  Overall Health  ▄▄▅█▆▃▅▆█▁▅▆▅▃  54.3% ↗

  ┌────────────────────┬────────────────────┬────────┬───┐
  │ Scanner            │ Trend              │ Latest │ Δ │
  ├────────────────────┼────────────────────┼────────┼───┤
  │ Design Tokens      │ ▁▁█▁▁             │  61.8% │ ↘ │
  │ TLP Headers        │ ▅▁██              │ 100.0% │ ↑ │
  └────────────────────┴────────────────────┴────────┴───┘
```

---

### `dcyfr fix` — Auto-Fix Engine

Automatically fix detected violations where supported.

```bash
dcyfr fix                     # Fix all fixable scanners
dcyfr fix tlp-headers         # Fix specific scanner
dcyfr fix --dry-run           # Preview without applying
dcyfr fix --project dcyfr-labs # Fix specific project
dcyfr fix --verbose           # Show detailed output
dcyfr fix --json              # Machine-readable output
dcyfr fix list                # List fixable scanners
```

**Fixable Scanners (4):**

| Scanner | What it fixes |
|---------|--------------|
| `license-headers` | Prepends MIT license header to `.ts`, `.tsx`, `.js`, `.mjs` files |
| `tlp-headers` | Prepends `<!-- TLP:CLEAR -->` to markdown files without TLP headers |
| `barrel-exports` | Creates missing `index.ts` barrel exports in component directories |
| `docs-structure` | Moves stray root-level documentation into `docs/<category>/` |

---

### `dcyfr daemon` — Workspace Guardian Daemon

Long-running background process that continuously monitors the workspace.

```bash
# Lifecycle
dcyfr daemon start              # Start in foreground
dcyfr daemon start --background # Start detached
dcyfr daemon stop               # Graceful shutdown
dcyfr daemon status             # Show daemon status
dcyfr daemon status --json      # JSON status

# Logs
dcyfr daemon logs               # Last 50 log lines
dcyfr daemon logs -n 100        # Last 100 lines
dcyfr daemon logs -f            # Follow (tail -f)

# macOS Launch Agent
dcyfr daemon install            # Install as Launch Agent
dcyfr daemon uninstall          # Remove Launch Agent
dcyfr daemon agent-status       # Check Launch Agent status
```

**Daemon Features:**
- **File Watcher** — Triggers scanners on file changes (debounced)
- **Scheduler** — Runs scanners on configurable intervals
- **Task Queue** — Priority-based with deduplication and rate limiting
- **Health Heartbeat** — Periodic health snapshots and state persistence
- **Log Rotation** — Auto-rotates when log exceeds 5MB (keeps 5 rotated files)
- **Notifications** — Terminal bell, macOS notifications, webhook on health changes
- **Crash Recovery** — PID file management, queue state persistence
- **launchd Integration** — Auto-start on macOS login, restart on crash

---

### `dcyfr config` — Configuration Management

Manage `.dcyfr/config.json` — unified configuration for all CLI features.

```bash
dcyfr config show              # Display current configuration
dcyfr config show --json       # JSON output
dcyfr config init              # Create default config file
dcyfr config validate          # Validate config against schema
dcyfr config set <key> <value> # Set a config value
dcyfr config reset             # Reset to defaults
```

**Configuration Sections:**

```json
{
  "daemon": {
    "healthInterval": 60000,
    "maxMemoryMB": 256,
    "gracefulShutdownTimeout": 10000,
    "watcherEnabled": true,
    "schedulerEnabled": true,
    "watcherDebounceMs": 1000
  },
  "logs": {
    "maxSizeBytes": 5242880,
    "maxFiles": 5
  },
  "notifications": {
    "terminalBell": true,
    "osNotification": true,
    "webhookUrl": null,
    "threshold": 10,
    "cooldownMs": 300000
  },
  "ai": {
    "provider": null,
    "model": null,
    "maxTokens": 4096,
    "temperature": 0.3,
    "rateLimitPerMinute": 30
  },
  "scanners": {}
}
```

**Setting Examples:**
```bash
dcyfr config set daemon.maxMemoryMB 512
dcyfr config set notifications.webhookUrl https://hooks.slack.com/...
dcyfr config set ai.provider anthropic
dcyfr config set scanners.license-headers.enabled false
```

---

### `dcyfr ai` — AI Provider Management

Configure and manage AI providers for enhanced scanning.

```bash
dcyfr ai status               # Show AI provider status
dcyfr ai config show           # Display AI configuration
dcyfr ai config set <key> <val> # Set AI config value
```

**Supported Providers:**

| Provider | Env Variable | Model |
|----------|-------------|-------|
| Anthropic | `ANTHROPIC_API_KEY` | claude-sonnet-4-20250514 |
| OpenAI | `OPENAI_API_KEY` | gpt-4o |
| Groq | `GROQ_API_KEY` | llama-3.3-70b-versatile |
| Ollama | (local) | llama3.2 |

---

### `dcyfr validate` — Quick Validation

Run key workspace validation checks (scanner-powered).

```bash
dcyfr validate                # Run all validators
dcyfr validate --verbose      # Detailed output
```

---

### `dcyfr status` — Workspace Status

Display workspace information and project summary.

```bash
dcyfr status                  # Show workspace status
```

---

### `dcyfr init` — Initialize Workspace

Initialize DCYFR configuration in the workspace.

```bash
dcyfr init                    # Set up .dcyfr/ directory
```

---

## Architecture

```
src/
├── cli.ts                    # CLI entry point (Commander.js)
├── commands/                 # Command implementations
│   ├── scan.ts               # dcyfr scan
│   ├── health.ts             # dcyfr health
│   ├── fix.ts                # dcyfr fix
│   ├── daemon.ts             # dcyfr daemon
│   ├── config.ts             # dcyfr config
│   ├── ai.ts                 # dcyfr ai
│   ├── validate.ts           # dcyfr validate
│   ├── status.ts             # dcyfr status
│   ├── init.ts               # dcyfr init
│   └── telemetry.ts          # dcyfr telemetry
├── scanners/                 # Scanner implementations
│   ├── types.ts              # Core types (Scanner, ScanResult, etc.)
│   ├── registry.ts           # Scanner registry + factory
│   ├── design-tokens.ts      # Design token compliance
│   ├── barrel-exports.ts     # Barrel export checker (fixable)
│   ├── pagelayout.ts         # PageLayout usage
│   ├── license-headers.ts    # License header checker (fixable)
│   ├── tlp-headers.ts        # TLP header checker (fixable)
│   ├── docs-structure.ts     # Documentation structure (fixable)
│   ├── dependency-audit.ts   # npm audit integration
│   ├── test-data-guardian.ts  # Test data leak detection
│   ├── docs-generator.ts     # Missing docs detection (AI)
│   ├── code-smell.ts         # Code smell detection (AI)
│   └── api-compliance.ts     # API pattern compliance (AI)
├── health/                   # Health scoring & visualization
│   ├── state.ts              # Score calculation, persistence
│   ├── dashboard.ts          # Terminal dashboard renderer
│   └── sparkline.ts          # Sparkline trend visualization
├── daemon/                   # Background daemon
│   ├── process.ts            # Process manager (orchestrator)
│   ├── events.ts             # Typed event bus
│   ├── queue.ts              # Priority task queue
│   ├── scheduler.ts          # Interval-based scheduler
│   ├── watcher.ts            # File watcher (chokidar)
│   ├── log-rotation.ts       # Log file rotation
│   ├── notifications.ts      # Multi-channel notifications
│   ├── launchd.ts            # macOS Launch Agent integration
│   └── types.ts              # Daemon type definitions
├── fix/                      # Auto-fix engine
│   └── engine.ts             # Fix orchestrator
├── ai/                       # AI provider abstraction
│   ├── provider.ts           # Multi-provider LLM client
│   └── ai-scanner.ts         # AI scanner base utilities
├── config/                   # Configuration management
│   └── schema.ts             # Config schema, validation, I/O
└── lib/                      # Shared utilities
    ├── files.ts              # File discovery, safe I/O
    ├── git.ts                # Git integration
    ├── workspace.ts          # Workspace root detection
    ├── logger.ts             # Structured logging
    └── errors.ts             # Error types
```

---

## State Files

All state is stored in `.dcyfr/` (gitignored):

| File | Purpose |
|------|---------|
| `config.json` | User configuration |
| `health.json` | Latest health snapshot |
| `health-history.json` | Health history (90 days) |
| `daemon.pid` | Running daemon PID |
| `daemon.log` | Daemon log output |
| `daemon-state.json` | Daemon runtime state |
| `ai.json` | AI provider configuration |
| `queue-state.json` | Persisted task queue |

---

## Health Scoring

Each scanner contributes to the overall health score with configurable weights:

| Scanner | Weight | Notes |
|---------|--------|-------|
| `design-tokens` | 3 | Critical for design system compliance |
| `dependency-audit` | 3 | Security-critical |
| `test-data-guardian` | 3 | Security-critical |
| `api-compliance` | 3 | API pattern enforcement |
| `barrel-exports` | 2 | Code organization |
| `pagelayout` | 2 | Architectural compliance |
| `docs-generator` | 2 | Documentation coverage |
| `code-smell` | 2 | Code quality |
| `license-headers` | 1 | Governance |
| `tlp-headers` | 1 | Classification |
| `docs-structure` | 1 | Organization |

**Status Thresholds:**
- 🟢 **Healthy:** ≥90%
- 🟡 **Degraded:** 70–89%
- 🔴 **Critical:** <70%
