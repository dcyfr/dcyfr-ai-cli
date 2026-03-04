# DCYFR AI CLI — False-Positive Filtering Instructions

<!-- TLP:AMBER -->
<!-- Referenced by .github/workflows/security-review.yml via false-positive-filtering-instructions -->
<!-- Plain English instructions telling Claude which findings to suppress or downgrade. -->

## Suppress These Categories Entirely

- **CLI-standard shell quoting warnings on spawn with array argv**: Calls to
  `spawn('program', ['arg1', 'arg2'])` with a fixed array (not a shell string)
  are safe. Do not flag these as command injection unless the array elements
  include unsanitised user input.

- **`process.exit()` calls**: CLI tools intentionally call `process.exit()` on
  fatal errors. Do not flag these as DoS or process control vulnerabilities.

- **Reading `process.env` for API keys**: Accessing `process.env.ANTHROPIC_API_KEY`
  or `process.env.DCYFR_API_KEY` is the correct pattern for CLI tools. Only
  report when an actual constant key value is hardcoded in source.

- **`~/.dcyfr/config.json` read operations**: The CLI intentionally reads
  from the user's home config file. Do not flag this as path traversal unless
  the path is constructed from untrusted user input rather than `os.homedir()`.

- **Console logging of command names or non-sensitive flags**: The CLI logs
  which subcommand is running and non-sensitive option names for developer
  experience. Do not flag general `console.log` calls as information disclosure
  unless sensitive values (API keys, tokens, PII) are included.

- **`npm pack` / `npm publish` invocations in release scripts**: Release scripts
  intentionally run npm publish commands. These are build-time, not runtime.

## Lower Severity (Report as Low / Informational Only)

- Files under `src/templates/` or `src/examples/` that scaffold code — these
  are static template strings, not dynamic code execution paths.

- Missing error code standardisation across CLI commands — this is a developer
  ergonomics issue, not a security vulnerability.

- Test configuration files that set liberal permissions for test isolation.

## Always Report (Do Not Suppress Even If Matching Above)

- Any hardcoded API key, token, or credentials string (even in comments or
  test fixtures).
- Any exec/spawn call where the entire command string is derived from user input
  (as opposed to individual argv elements).
- Path traversal outside the working directory to sensitive system paths
  (`~/.ssh`, `~/.aws`, `/etc`, etc.).
- RCE via deserialization of untrusted input.
- API keys or tokens passed as URL query parameters rather than Authorization
  headers.
- Any network call that sends project file contents, environment variables, or
  API keys to an external host without explicit user consent.
