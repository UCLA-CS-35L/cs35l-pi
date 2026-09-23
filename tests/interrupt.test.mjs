import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

test('Ctrl+C interrupts a TUI turn, then shows an idle hint before double-press exit', { timeout: 90000 }, async () => {
  const { stdout } = await promisify(execFile)('python3', [
    fileURLToPath(new URL('./fixtures/interrupt-pty.py', import.meta.url)),
    process.execPath,
    fileURLToPath(new URL('./fixtures/interrupt-ui.mjs', import.meta.url)),
  ], { timeout: 85000, maxBuffer: 1024 * 1024 });
  assert.match(stdout, /PTY verified/);
});
