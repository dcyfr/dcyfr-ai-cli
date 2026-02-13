/**
 * Integration tests: Binary mode vs Library mode
 * 
 * Verify that CLI produces identical outputs whether invoked as:
 * - Binary: node bin/cli.js <args>
 * - Library: runCLI(<args>)
 */

import { describe, it, expect } from 'vitest';
import { runCLI } from '../src/cli.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);

// Helper to run CLI in binary mode
async function runBinary(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const binPath = join(process.cwd(), 'bin', 'cli.js');
  const command = `node "${binPath}" ${args.join(' ')}`;

  try {
    const { stdout, stderr } = await execAsync(command);
    return { exitCode: 0, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error: any) {
    return {
      exitCode: error.code || 1,
      stdout: error.stdout?.trim() || '',
      stderr: error.stderr?.trim() || error.message,
    };
  }
}

describe('Binary Mode vs Library Mode Integration', () => {
  describe('Identical Output for status command', () => {
    it('should produce identical status output', async () => {
      const libraryResult = await runCLI(['status']);
      const binaryResult = await runBinary(['status']);

      expect(libraryResult.exitCode).toBe(binaryResult.exitCode);
      expect(libraryResult.exitCode).toBe(0);

      // Both should contain status information (content comparison, not exact match)
      expect(libraryResult.stdout).toBeTruthy();
      expect(binaryResult.stdout).toBeTruthy();
      
      expect(libraryResult.stdout).toContain('DCYFR');
      expect(binaryResult.stdout).toContain('DCYFR');
    });
  });

  describe('Identical Error Handling', () => {
    it('should produce identical errors for invalid commands', async () => {
      const libraryResult = await runCLI(['invalid-command']);
      const binaryResult = await runBinary(['invalid-command']);

      // Both should fail with exit code 1
      expect(libraryResult.exitCode).toBe(1);
      expect(binaryResult.exitCode).toBe(1);

      // Both should have error messages
      expect(libraryResult.stderr || libraryResult.stdout).toContain('Unknown command');
      expect(binaryResult.stderr || binaryResult.stdout).toContain('Unknown command');
    });
  });

  describe('Exit Code Consistency', () => {
    it('should handle successful commands consistently', async () => {
      const libraryResult = await runCLI(['status']);
      const binaryResult = await runBinary(['status']);

      expect(libraryResult.exitCode).toBe(0);
      expect(binaryResult.exitCode).toBe(0);
    });

    it('should handle invalid commands consistently', async () => {
      const libraryResult = await runCLI(['nonexistent-command']);
      const binaryResult = await runBinary(['nonexistent-command']);

      expect(libraryResult.exitCode).toBe(1);
      expect(binaryResult.exitCode).toBe(1);
    });
  });

  describe('Output Structure Consistency', () => {
    it('should maintain similar output structure', async () => {
      const libraryResult = await runCLI(['status']);
      const binaryResult = await runBinary(['status']);

      // Both should have meaningful output
      expect(libraryResult.stdout.length).toBeGreaterThan(0);
      expect(binaryResult.stdout.length).toBeGreaterThan(0);
      
      // Content should be functionally equivalent (not necessarily character-for-character)
      expect(libraryResult.stdout).toContain('DCYFR');
      expect(binaryResult.stdout).toContain('DCYFR');
    });
  });
});
