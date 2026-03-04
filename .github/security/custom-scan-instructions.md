# DCYFR AI CLI — Custom Security Scan Instructions

<!-- TLP:AMBER -->
<!-- Referenced by .github/workflows/security-review.yml via custom-security-scan-instructions -->
<!-- Provides stack context and focus areas so analysis is precise rather than generic. -->

## Tech Stack Context

- **Package type**: Public CLI executable npm package (`@dcyfr/ai-cli`).
  Installed globally with `npm install -g @dcyfr/ai-cli` and invoked directly
  from the user's terminal. Any security issue directly affects every developer
  who installs the package.
- **Runtime environment**: Node.js CLI (no browser, no server). Commands are
  invoked by humans or automation scripts in local development environments and
  CI/CD pipelines.
- **Argument parsing**: Commands accept positional arguments and flags from the
  process argv. Treat all argv inputs as untrusted.
- **File system access**: CLI reads and writes to configuration files, output
  directories, and project files within the user's project. Any path derived
  from user input must be validated against path traversal.
- **Subprocess execution**: Any `child_process.exec`, `spawn`, or `execa` call
  where arguments derive from CLI flags or config files is a command injection
  risk. Prefer `spawn` with an array argv over `exec` with a shell string.
- **Network requests**: CLI may call DCYFR APIs or Anthropic APIs. API keys
  are read from environment variables (ANTHROPIC_API_KEY, DCYFR_API_KEY) or
  from `~/.dcyfr/config.json`. Verify keys are never logged.
- **Configuration files**: CLI reads local config (`.dcyfr.json`, `package.json`
  `dcyfr.*` fields). These files are authored by developers but could be
  malicious if running in untrusted project directories (supply chain attack
  scenario).

## High-Priority Areas to Focus On

1. **Subprocess execution** (`src/commands/`, `src/utils/exec.ts` or similar):
   Any call to `exec`, `spawn`, `execSync`, or `execa` where part of the
   command string is derived from user flags, config files, or environment
   variables is a command injection risk. Prefer `spawn` with a fixed argv
   array; flag any template-literal shell invocations.

2. **Path traversal in file operations**: Any file read, write, or resolve
   operation where the path is built from CLI flags or config values must be
   validated to remain within the intended working directory. Look for
   `path.join(process.cwd(), userInput)` without a containment check.

3. **Configuration file trust boundary** (`src/config/`, loader functions):
   Verify that values read from `.dcyfr.json` or `package.json#dcyfr` are
   validated before use. Flag any value that flows to exec/spawn/fetch without
   sanitisation.

4. **API key handling** (any code reading env vars or config files):
   Verify keys are never passed in URL query strings, never written to log
   files, and never included in error stack traces. Check debug and verbose
   logging paths.

5. **Dependency integrity for globally installed tools**: Verify that `bin`
   scripts do not load dependencies from user-controlled paths. Check
   `resolve()` or `require()` calls that use user-supplied module names.

6. **Update checking / telemetry** (if present): Any network call that
   includes version, OS, or project metadata should clearly document what is
   sent. Flag undisclosed collection of project-level data.

## Severity Calibration Guidance

- **Critical**: Command injection via exec/spawn with user-supplied args,
  hardcoded API key or token in source, path traversal to sensitive paths
  (e.g., `~/.ssh`, `~/.aws`), RCE via malicious config file.
- **High**: API key leakage through logs, URL query strings, or telemetry;
  path traversal within the project directory boundary; unsafe deserialization
  of config files.
- **Medium**: Information disclosure (project name, paths, dev environment
  metadata) in error messages sent to remote endpoints; TOCTOU on config file
  reads.
- **Low / Informational**: Missing input validation on non-sensitive flags,
  verbose internal state in debug output, best-practice deviations without a
  direct exploitability path.

## Out of Scope

- `node_modules/` — dependency scanning handled by Dependabot and `npm audit`.
- `dist/` — generated build output.
- `docs/` — documentation.
- `scripts/` — build and release tooling.
- `coverage/` — test coverage reports.
- Test files (`*.test.ts`, `*.spec.ts`) — note issues but do not block PRs on
  low-severity test-only findings.
