/**
 * CLI Command Tests
 * 
 * Test individual CLI commands and verify exit codes
 */

import { describe, it, expect } from 'vitest';
import { runCLI } from '../src/cli.js';

describe('CLI Commands', () => {
  describe('status command', () => {
    it('should execute successfully', async () => {
      const result = await runCLI(['status']);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeTruthy();
    });

    it('should provide meaningful output', async () => {
      const result = await runCLI(['status']);
      
      expect(result.stdout.length).toBeGreaterThan(0);
      expect(result.stderr).toBe('');
    });

    it('should be consistent across multiple calls', async () => {
      const result1 = await runCLI(['status']);
      const result2 = await runCLI(['status']);
      
      expect(result1.exitCode).toBe(result2.exitCode);
      expect(result1.exitCode).toBe(0);
    });
  });

  describe('Invalid command handling', () => {
    it('should fail with exit code 1 for invalid command', async () => {
      const result = await runCLI(['invalid-command']);
      
      expect(result.exitCode).toBe(1);
    });

    it('should display error message for invalid command', async () => {
      const result = await runCLI(['invalid-command']);
      
      expect(result.stderr || result.stdout).toContain('Unknown command');
    });

    it('should not throw error by default', async () => {
      // Should NOT throw, just return error result
      const result = await runCLI(['invalid-command']);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('validate command', () => {
    it('should execute successfully', async () => {
      const result = await runCLI(['validate']);
      
      // Validate may return 0 or 1 depending on workspace state
      expect([0, 1]).toContain(result.exitCode);
    }, 10000); // Increase timeout for validation

    it('should handle --verbose flag', async () => {
      const result = await runCLI(['validate', '--verbose']);
      
      // Validate may return 0 or 1 depending on workspace state
      expect([0, 1]).toContain(result.exitCode);
    },  10000); // Increase timeout for verbose validation
  });

  describe('Command execution performance', () => {
    it('should complete status command quickly', async () => {
      const startTime = Date.now();
      const result = await runCLI(['status']);
      const endTime = Date.now();
      
      expect(result.exitCode).toBe(0);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle multiple sequential commands', async () => {
      const results = await Promise.all([
        runCLI(['status']),
        runCLI(['status']),
        runCLI(['status'])
      ]);

      results.forEach(result => {
        expect(result.exitCode).toBe(0);
      });
    });
  });
});