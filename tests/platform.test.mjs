import test from 'node:test';
import assert from 'node:assert/strict';
import { sandboxPlatform, commandPath } from '../lib/platform.mjs';

test('macOS uses Seatbelt, protects its private directories, and finds Homebrew without inheriting PATH', () => {
  const mac = sandboxPlatform('darwin');
  assert.deepEqual(mac.required, ['sandbox-exec']);
  assert.ok(mac.privateRoots.includes('/Users'));
  assert.ok(mac.privateRoots.includes('/private/var/folders'));
  assert.ok(commandPath('/fixture/rg', 'darwin').split(':').includes('/opt/homebrew/bin'));
  assert.ok(!commandPath('/fixture/rg', 'darwin').split(':').includes('.'));
  assert.throws(() => sandboxPlatform('win32'), /WSL2/);
  assert.deepEqual(sandboxPlatform('linux').required, ['bwrap', 'socat']);
});

test('canonical paths preserve missing top-level components', async () => {
  const { canonical } = await import('../lib/paths.mjs');
  assert.equal(canonical('/__cs35l_missing_fixture__/child'), '/__cs35l_missing_fixture__/child');
});
