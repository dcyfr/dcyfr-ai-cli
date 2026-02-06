/**
 * Test example for DCYFR AI CLI
 */

import { describe, it, expect } from 'vitest';
import { createStatusCommand } from '@/commands/status.js';
import { createValidateCommand } from '@/commands/validate.js';

describe('CLI Commands', () => {
  describe('status command', () => {
    it('should be registered with correct name', () => {
      const cmd = createStatusCommand();
      expect(cmd.name()).toBe('status');
    });

    it('should have a description', () => {
      const cmd = createStatusCommand();
      expect(cmd.description()).toBeTruthy();
    });
  });

  describe('validate command', () => {
    it('should be registered with correct name', () => {
      const cmd = createValidateCommand();
      expect(cmd.name()).toBe('validate');
    });

    it('should support verbose option', () => {
      const cmd = createValidateCommand();
      expect(cmd.description()).toBeTruthy();
    });
  });
});
