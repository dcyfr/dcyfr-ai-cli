# AGENTS.md - @dcyfr/ai-cli

**DCYFR AI Command-Line Interface**

Version: 1.0.0  
Type: CLI Package  
License: MIT  
Status: Extracted from dcyfr-ai-nodejs

---

## 🎯 Project Overview

This is a **standalone, portable CLI package** for the DCYFR AI framework:

- **Extracted from**: dcyfr-ai-nodejs starter template
- **Purpose**: Provide cross-platform CLI interface for DCYFR AI framework
- **Target Users**: Developers integrating DCYFR AI into their workflows
- **Portability**: Windows, macOS, Linux support

---

## 🏗️ Architecture Patterns

### 1. Command Architecture

Commands are modular and registered with the main CLI:

```typescript
// src/commands/my-command.ts
import { Command } from 'commander';
import { createLogger } from '@/lib/logger.js';

const logger = createLogger('my-command');

export function createMyCommand(): Command {
  return new Command('my-command')
    .description('Description of my command')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options) => {
      try {
        // Implementation
        logger.info('Command executed');
      } catch (error) {
        logger.error('Command failed', { error });
        process.exit(1);
      }
    });
}
```

### 2. Main CLI Registration

Commands are added to the main program in `src/cli.ts`:

```typescript
import { createMyCommand } from './commands/my-command.js';

program.addCommand(createMyCommand());
```

### 3. Cross-Platform Configuration

Configuration loading respects OS-specific paths:

```typescript
// Windows: %APPDATA%\.dcyfr\
// macOS/Linux: ~/.dcyfr/

import { getConfigDir } from '@/lib/config.js';
const configDir = getConfigDir(); // Platform-appropriate path
```

### 4. Logging Pattern

Structured JSON logging for consistency:

```typescript
import { createLogger } from '@/lib/logger.js';

const logger = createLogger('my-module');

logger.info('Operation complete', { userId: '123', duration: 'ms' });
// Output: {"timestamp":"2026-02-05T...","level":"info","namespace":"my-module","message":"Operation complete","userId":"123","duration":"ms"}
```

---

## 🔧 Development Patterns

### Adding a New Command

1. **Create command file** in `src/commands/`:

```typescript
// src/commands/greet.ts
import { Command } from 'commander';

export function createGreetCommand(): Command {
  return new Command('greet')
    .description('Greet the user')
    .argument('<name>', 'Name to greet')
    .action((name) => {
      console.log(`👋 Hello, ${name}!`);
    });
}
```

2. **Register in main CLI** (`src/cli.ts`):

```typescript
import { createGreetCommand } from './commands/greet.js';

program.addCommand(createGreetCommand());
```

3. **Test the command**:

```bash
npm run build
npm start greet John
# Output: 👋 Hello, John!
```

### Adding Options & Arguments

```typescript
export function createExampleCommand(): Command {
  return new Command('example')
    .description('Example command')
    .argument('<input>', 'Input file')
    .argument('[output]', 'Output file (optional)')
    .option('-v, --verbose', 'Verbose output')
    .option('-f, --force', 'Force overwrite')
    .option('-c, --config <path>', 'Config file path')
    .action(async (input, output, options) => {
      // input: required argument
      // output: optional argument
      // options.verbose: boolean
      // options.force: boolean
      // options.config: string value
    });
}
```

### Cross-Platform File Handling

Use Node.js `path` module for all file operations:

```typescript
import { join, resolve } from 'path';
import { readFile, writeFile } from 'fs/promises';

// Cross-platform path joining
const configPath = join(process.cwd(), 'config.json');

// Platform-appropriate home directory
import { homedir } from 'os';
const homeConfig = join(homedir(), '.dcyfr', 'config.json');

// Read/write files (works on all platforms)
const content = await readFile(configPath, 'utf-8');
await writeFile(configPath, JSON.stringify(data, null, 2));
```

---

## 📦 Package Structure

```
dcyfr-ai-cli/
├── src/
│   ├── cli.ts              # Main entry point
│   ├── lib/
│   │   ├── config.ts       # Config loading (cross-platform)
│   │   └── logger.ts       # Structured logging
│   └── commands/
│       ├── init.ts
│       ├── status.ts
│       ├── telemetry.ts
│       └── validate.ts
├── tests/                  # Unit tests
├── dist/                   # Compiled output
├── package.json            # npm configuration
├── tsconfig.json           # TypeScript config
└── eslint.config.mjs       # ESLint rules
```

---

## 🔄 Cross-Platform Patterns

### 1. Config Directory Detection

```typescript
import { homedir } from 'os';

function getConfigDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (!appData) throw new Error('APPDATA not set');
    return join(appData, '.dcyfr');
  }
  return join(homedir(), '.dcyfr');
}
```

### 2. Executable Permission (Unix)

The shebang in `src/cli.ts` handles Unix-style execution:

```typescript
#!/usr/bin/env node
// ^^^ This line enables:
// - ./dist/cli.js --help (on macOS/Linux)
// - npm link → dcyfr command (globally)
```

### 3. npm bin Wrapper (Windows)

npm automatically creates a `.cmd` wrapper on Windows for the `bin` entry in `package.json`:

```json
{
  "bin": {
    "dcyfr": "./dist/cli.js"
  }
}
```

Result on Windows:
- `node_modules/.bin/dcyfr.cmd` (wrapper)
- `node_modules/.bin/dcyfr` (symlink to cli.js)

---

## 🧪 Testing Patterns

### Testing a Command

```typescript
import { describe, it, expect } from 'vitest';
import { createStatusCommand } from '@/commands/status.js';

describe('status command', () => {
  it('displays framework status', async () => {
    const command = createStatusCommand();
    // Test command registration
    expect(command.name()).toBe('status');
  });
});
```

### Mocking Configuration

```typescript
import { vi } from 'vitest';
import * as config from '@/lib/config.js';

vi.spyOn(config, 'loadConfig').mockResolvedValue({
  telemetry: { enabled: true, level: 'info', endpoints: [] },
  validation: { enabled: true, strict: true },
  cli: { verboseLogging: false, colorOutput: true },
});
```

---

## 🚀 Deployment & Distribution

### Build for Release

```bash
npm run build          # Compile TypeScript
npm run test:coverage  # Generate coverage report
npm run lint           # Check code quality
npm version patch      # Bump version
npm publish            # Publish to npm
```

### Distribution Methods

1. **npm Package** (recommended):
   ```bash
   npm install -g @dcyfr/ai-cli
   ```

2. **GitHub Releases**:
   - Attach built `dist/` directory
   - Create standalone executables (future: pkg/esbuild)

3. **Source Code**:
   ```bash
   git clone https://github.com/dcyfr/dcyfr-ai-cli
   npm install
   npm link
   ```

---

## 🔌 Extensibility

### Adding a Plugin System

Future pattern for extending CLI with plugins:

```typescript
// src/lib/plugin.ts
export interface CLIPlugin {
  name: string;
  description: string;
  commands: Command[];
}

export function registerPlugin(program: Command, plugin: CLIPlugin): void {
  plugin.commands.forEach((cmd) => program.addCommand(cmd));
}
```

### External Command Registration

Allow external packages to register commands:

```typescript
// Future: ~/.dcyfr/plugins/
const pluginDir = join(getConfigDir(), 'plugins');
const plugins = await loadPluginsFromDir(pluginDir);
plugins.forEach((plugin) => registerPlugin(program, plugin));
```

---

## 🐛 Common Patterns & Gotchas

### 1. ESM Import Paths

Always use explicit file extensions in imports (required for ESM):

```typescript
// ✅ Correct
import { createLogger } from './lib/logger.js';
import { loadConfig } from './lib/config.js';

// ❌ Wrong
import { createLogger } from './lib/logger';
import { loadConfig } from './lib/config';
```

### 2. Path Resolution

Use `path` module, not string concatenation:

```typescript
// ✅ Correct
const configPath = join(process.cwd(), 'config.json');

// ❌ Wrong (breaks on Windows)
const configPath = `${process.cwd()}/config.json`;
```

### 3. Process Cleanup

Always exit gracefully:

```typescript
try {
  await operation();
  process.exit(0); // Success
} catch (error) {
  logger.error('Operation failed', { error });
  process.exit(1); // Failure
}
```

### 4. Home Directory Detection

Always use `os.homedir()`:

```typescript
// ✅ Correct
import { homedir } from 'os';
const configDir = join(homedir(), '.dcyfr');

// ❌ Wrong
const configDir = `${process.env.HOME}/.dcyfr`; // Doesn't work on Windows
```

---

## 📞 Integration with Other Packages

### Using in dcyfr-ai-nodejs

```json
{
  "dependencies": {
    "@dcyfr/ai-cli": "^1.0.0"
  }
}
```

```bash
npm install @dcyfr/ai-cli
npx dcyfr status
```

### Using in dcyfr-ai-sandbox

```typescript
import { program } from '@dcyfr/ai-cli';

// Extend the CLI with sandbox-specific commands
program.addCommand(createSandboxCommand());
```

---

## 🔗 References

- [Commander.js Documentation](https://github.com/tj/commander.js)
- [Node.js Path Module](https://nodejs.org/api/path.html)
- [Node.js OS Module](https://nodejs.org/api/os.html)
- [ESM in Node.js](https://nodejs.org/api/esm.html)
- [Cross-platform Development Guide](https://nodejs.org/en/docs/guides/simple-local-development-environment-setup/)

---

**Last Updated:** February 5, 2026  
**Status:** Active - Extracted from dcyfr-ai-nodejs v1.0.0

## Quality Gates
- TypeScript: 0 errors (`npm run typecheck`)
- Tests: ≥99% pass rate (`npm run test`)
- Lint: 0 errors (`npm run lint`)
