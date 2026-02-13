/**
 * Unit tests for runCLI library mode API
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCLI } from '../src/cli.js';
import type { CLIResult } from '../src/lib/types.js';

describe('runCLI Library Mode', () => {
  describe('Return Value Structure', () => {
    it('should return CLIResult with correct shape on success', async () => {
      const result: CLIResult = await runCLI(['status']);

      expect(result).toHaveProperty('exitCode');
      expect(result).toHaveProperty('stdout');
      expect(result).toHaveProperty('stderr');
      expect(typeof result.exitCode).toBe('number');
      expect(typeof result.stdout).toBe('string');
      expect(typeof result.stderr).toBe('string');
    });

    it('should have exitCode 0 on successful execution', async () => {
      const result = await runCLI(['status']);
      expect(result.exitCode).toBe(0);
    });

    it('should capture stdout for successful commands', async () => {
      const result = await runCLI(['status']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeTruthy();
    });

    it('should have exitCode 1 on error', async () => {
      const result = await runCLI(['invalid-command']);
      expect(result.exitCode).toBe(1);
    });

    it('should capture stderr for errors', async () => {
      const result = await runCLI(['invalid-command']);
      expect(result.stderr).toBeTruthy();
      expect(result.stderr).toContain('Unknown command');
    });
  });

  describe('Error Handling Strategy', () => {
    it('should return errors as values by default (throw: false)', async () => {
      const result = await runCLI(['invalid-command']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBeTruthy();
      // Should NOT throw - this is the key test
    });

    it('should return errors as values when throw is explicitly false', async () => {
      const result = await runCLI(['invalid-command'], { throw: false });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBeTruthy();
    });

    it('should throw errors when throw is true', async () => {
      await expect(
        runCLI(['invalid-command'], { throw: true })
      ).rejects.toThrow();
    });

    it('should return success normally even with throw: true', async () => {
      const result = await runCLI(['--version'], { throw: true });
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Options Parameter', () => {
    it('should work without options parameter', async () => {
      const result = await runCLI(['--version']);
      expect(result.exitCode).toBe(0);
    });

    it('should work with empty options object', async () => {
      const result = await runCLI(['--version'], {});
      expect(result.exitCode).toBe(0);
    });

    it('should respect throw option', async () => {
      const resultNoThrow = await runCLI(['invalid-command'], { throw: false });
      expect(resultNoThrow.exitCode).toBe(1);

      await expect(
        runCLI(['invalid-command'], { throw: true })
      ).rejects.toThrow();
    });
  });

  describe('Arguments Parsing', () => {
    it('should parse status command', async () => {
      const result = await runCLI(['status']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeTruthy();
    });

    it('should execute commands successfully', async () => {
      const result = await runCLI(['status']);
      expect(result.exitCode).toBe(0);
    });

    it('should default to process.argv.slice(2) when no args provided', async () => {
      // Save original argv
      const originalArgv = process.argv;
      
      try {
        process.argv = ['node', 'cli.js', 'status'];
        const result = await runCLI();
        expect(result.exitCode).toBe(0);
      } finally {
        // Restore original argv
        process.argv = originalArgv;
      }
    });
  });

  describe('Output Capturing', () => {
    it('should capture all stdout', async () => {
      const result = await runCLI(['status']);
      expect(result.stdout).toBeTruthy();
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    it('should separate stdout and stderr', async () => {
      const successResult = await runCLI(['status']);
      expect(successResult.stdout).toBeTruthy();
      expect(successResult.stderr).toBe('');

      const errorResult = await runCLI(['invalid-command']);
      expect(errorResult.stderr).toBeTruthy();
    });
  });

  describe('Exit Codes', () => {
    it('should return exitCode 0 for valid commands', async () => {
      const result = await runCLI(['status']);
      expect(result.exitCode).toBe(0);
    });

    it('should return exitCode 1 for invalid commands', async () => {
      const result = await runCLI(['invalid-command']);
      expect(result.exitCode).toBe(1);
    });
  });
});
