# Contributing to DCYFR AI CLI

First off, thanks for considering contributing to DCYFR AI CLI! It's people like you that make this such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](../CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the [issue list](https://github.com/dcyfr/dcyfr-ai-cli/issues) as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps which reproduce the problem**
- **Provide specific examples to demonstrate the steps**
- **Describe the behavior you observed after following the steps**
- **Explain which behavior you expected to see instead and why**
- **Include screenshots if possible**
- **Include your environment**: OS, Node.js version, npm version, etc.

### Suggesting Enhancements

Enhancement suggestions are tracked as [GitHub issues](https://github.com/dcyfr/dcyfr-ai-cli/issues). When creating an enhancement suggestion, please include:

- **Use a clear and descriptive title**
- **Provide a step-by-step description of the suggested enhancement**
- **Provide specific examples to demonstrate the steps**
- **Describe the current behavior and the proposed behavior**
- **Explain why this enhancement would be useful**

### Pull Requests

- Fill in the required template
- Follow the TypeScript and code style guidelines
- Document new code with JSDoc comments
- Include appropriate test cases
- End all files with a newline
- Avoid platform-dependent code; use `path`, `os`, and other Node.js modules for cross-platform compatibility

## Development Setup

### Prerequisites

- Node.js ≥ 20.0.0
- npm ≥ 10.0.0
- Git

### Local Development

1. **Fork the repository**:
   ```bash
   # Click "Fork" on GitHub
   ```

2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR-USERNAME/dcyfr-ai-cli.git
   cd dcyfr-ai-cli
   ```

3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/dcyfr/dcyfr-ai-cli.git
   ```

4. **Install dependencies**:
   ```bash
   npm install
   ```

5. **Create a feature branch**:
   ```bash
   git checkout -b feature/my-feature
   ```

6. **Make your changes** and test locally:
   ```bash
   npm run build
   npm start --help
   ```

7. **Run tests**:
   ```bash
   npm test
   npm run test:coverage
   ```

8. **Lint and format**:
   ```bash
   npm run lint:fix
   npm run format
   ```

9. **Commit your changes**:
   ```bash
   git commit -am 'Add my feature'
   ```

10. **Push to your fork**:
    ```bash
    git push origin feature/my-feature
    ```

11. **Create a Pull Request** on GitHub

## Styleguides

### Git Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line
- Example:
  ```
  Add cross-platform config directory detection
  
  - Uses os.homedir() for proper home directory resolution
  - Respects APPDATA on Windows
  - Fixes #123
  ```

### TypeScript/JavaScript Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Follow the existing code style
- Use TypeScript strict mode
- Add JSDoc comments to public functions

```typescript
/**
 * Load application configuration from multiple sources
 * @param options - Configuration loading options
 * @returns The loaded configuration object
 */
export async function loadConfig(options?: ConfigOptions): Promise<AppConfig> {
  // Implementation
}
```

### Documentation Style

- Use Markdown for documentation
- Keep lines under 100 characters
- Use descriptive headers
- Include code examples
- Use proper spelling and grammar

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Writing Tests

- Place tests in `tests/` directory
- Use `.test.ts` or `.spec.ts` suffix
- Use Vitest framework
- Aim for>80% code coverage

Example:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStatusCommand } from '@/commands/status.js';

describe('status command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display framework status', () => {
    const command = createStatusCommand();
    expect(command.name()).toBe('status');
  });
});
```

## Additional Notes

### Cross-Platform Development

When contributing, always test on multiple platforms if possible:

```bash
# Windows (PowerShell)
npm run build
npm start status

# macOS/Linux (Bash)
npm run build
npm start status
```

### Key Cross-Platform Considerations

- Use `path` module for file paths, not string concatenation
- Use `os.homedir()` for home directory, not `$HOME` or `~`
- Respect `APPDATA` on Windows
- Use `fs/promises` for async file operations
- Test path handling with backslashes on Windows

### Code Review Process

1. At least one review from project maintainers
2. All tests must pass
3. No ESLint or TypeScript errors
4. Commit messages should be clear and descriptive
5. Documentation must be updated for new features

## Questions?

Feel free to open an issue with the question tag or reach out to the maintainers.

## License

By contributing to DCYFR AI CLI, you agree that your contributions will be licensed under its MIT License.
