import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

test('wrapper resumes across workspaces through the native session picker', { timeout: 120000 }, async () => {
  const { stdout } = await promisify(execFile)('python3', [
    fileURLToPath(new URL('./fixtures/resume-pty.py', import.meta.url)), process.execPath,
    fileURLToPath(new URL('..', import.meta.url)),
  ], { timeout: 115000, maxBuffer: 1024 * 1024 });
  assert.match(stdout, /PTY verified/);
});
