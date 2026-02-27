#!/usr/bin/env node

/**
 * DCYFR AI CLI Binary Entry Point
 * 
 * Thin wrapper that loads the compiled CLI and executes it.
 * All CLI logic lives in src/cli.ts and compiles to dist/cli.js.
 */

// Import the compiled runCLI function
import { runCLI } from '../dist/index.js';

// Execute CLI in binary mode
runCLI()
  .then((result) => {
    process.exit(result.exitCode);
  })
  .catch((error) => {
    console.error('Failed to execute DCYFR CLI:', error.message);
    process.exit(1);
  });
