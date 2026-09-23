import test from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApprovalBroker, requestApproval } from '../lib/approval.mjs';
const request = { command: 'printf ok', cwd: '/tmp/example', agent: 'test child', domains: [] };
async function withBroker(decide, fn) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cs35l-test-approval-')));
  const broker = await new ApprovalBroker(join(dir, 'socket'), decide).start();
  try { await fn(broker); } finally { await broker.close(); rmSync(dir, { recursive: true, force: true }); }
}
test('each invocation requires a fresh decision; denial is not cached as approval', async () => {
  let calls = 0;
  await withBroker(async () => ({ approved: ++calls === 1, readOnly: true }), async b => {
    assert.equal((await requestApproval(b.socketPath, b.token, request)).readOnly, true);
    await assert.rejects(requestApproval(b.socketPath, b.token, request), /denied/);
    assert.equal(calls, 2);
  });
});
test('forged channel token never reaches the human decision callback', async () => {
  await withBroker(() => assert.fail('unauthenticated request reached UI'), async b => {
    await assert.rejects(requestApproval(b.socketPath, 'forged', request), /denied/);
  });
});
test('concurrent requests are serialized and preserve each command', async () => {
  const seen = []; let active = 0;
  await withBroker(async r => {
    assert.equal(++active, 1); seen.push(r.command);
    await new Promise(resolve => setTimeout(resolve, 15)); active--;
    return { approved: true };
  }, async b => { await Promise.all(['first', 'second'].map(command => requestApproval(b.socketPath, b.token, { ...request, command }))); });
  assert.deepEqual(seen, ['first', 'second']);
});
test('abort and parent disappearance fail closed', async () => {
  await withBroker((_r, signal) => new Promise(resolve => signal.addEventListener('abort', () => resolve({ approved: false }))), async b => {
    const abort = new AbortController();
    const pending = requestApproval(b.socketPath, b.token, request, abort.signal);
    abort.abort(); await assert.rejects(pending, /cancelled/);
    const second = requestApproval(b.socketPath, b.token, request);
    const rejected = assert.rejects(second);
    await b.close(); await rejected;
  });
});
test('wildcard network requests are rejected', async () => {
  assert.throws(() => requestApproval('/none', 'token', { ...request, domains: ['*'] }), /DNS/);
});
test('network grants come from the user decision, not the requested permission', async () => {
  await withBroker(async r => {
    assert.equal(r.networkAccess, true);
    return { approved: true, networkAccess: false, domains: [] };
  }, async b => {
    const grant = await requestApproval(b.socketPath, b.token, { ...request, networkAccess: true });
    assert.equal(grant.networkAccess, false);
    assert.deepEqual(grant.domains, []);
  });
  await withBroker(async () => ({ approved: true, networkAccess: true }), async b => {
    const grant = await requestApproval(b.socketPath, b.token, request);
    assert.equal(grant.networkAccess, true);
  });
});
