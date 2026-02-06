# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in DCYFR AI CLI, please email hello@dcyfr.ai with:

- Description of the vulnerability
- Steps to reproduce it
- Potential impact
- Suggested fix (if applicable)

Please do not open public GitHub issues for security vulnerabilities.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅ Yes   |
| < 1.0   | ❌ No    |

## Security Best Practices

When using DCYFR AI CLI:

1. Keep Node.js and npm updated
2. Review configuration files for sensitive data
3. Do not commit `.dcyfr.json` with secrets to version control
4. Use environment variables for sensitive configuration
5. Regularly update your CLI version for security patches

## Dependencies

DCYFR AI CLI depends on:
- `commander` - Command-line interface creation
- `@dcyfr/ai` - DCYFR AI framework

These dependencies are regularly updated for security patches.
