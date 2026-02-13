/**
 * CLI Mode Management
 * 
 * Manages whether CLI is running in library mode or binary mode
 * to prevent process.exit calls during testing
 */

let _isLibraryMode = false;

export function setLibraryMode(value: boolean): void {
  _isLibraryMode = value;
}

export function isLibraryMode(): boolean {
  return _isLibraryMode;
}

export function safeExit(code: number): void {
  if (_isLibraryMode) {
    const error = new Error(`Command exit with code ${code}`) as any;
    error.exitCode = code;
    error.code = 'CLI_EXIT';
    throw error;
  } else {
    process.exit(code);
  }
}