import test from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync, mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

test('real Pi extension lifecycle enforces approval, plan mode, and headless denial', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cs35l-integration-')));
  process.env.CS35L_STATE_DIR = join(dir, 'state');
  const work = join(dir, 'work'); mkdirSync(work);
  const { prepareEnvironment } = await import('../lib/environment.mjs');
  const { createHarnessRuntime } = await import('../lib/session.mjs');
  const paths = prepareEnvironment(work);
  const original = process.cwd(); process.chdir(work);
  let session;
  try {
    ({ session } = await createHarnessRuntime(paths));
    const errors = [];
    await session.bindExtensions({ mode: 'print', onError: e => errors.push(e) });
    const runner = session.extensionRunner;
    assert.ok(runner.getCommand('init'), '/init must be registered in the harness session');
    const bash = runner.getToolDefinition('bash');
    const invoke = command => bash.execute('test', { command }, undefined, undefined, runner.createContext());
    await assert.rejects(invoke('touch denied'), /denied|approved/i);
    assert.equal(existsSync(join(work, 'denied')), false);
    let decisions = 0, approve = true;
    runner.setUIContext({ ...runner.getUIContext(), select: async (_title, choices) => { decisions++; return approve ? choices[0] : 'Cancel'; } }, 'interactive');
    await invoke('printf approved > result; rg --version');
    assert.equal(readFileSync(join(work, 'result'), 'utf8'), 'approved');
    approve = false;
    await assert.rejects(invoke('touch denied'), /denied|approved/i);
    assert.equal(existsSync(join(work, 'denied')), false);
    assert.equal(decisions, 2);
    let hits = 0;
    const server = createServer((_req, res) => { hits++; res.end('network-approved'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const networkArgs = { command: `curl --noproxy '*' --max-time 2 -fsS http://127.0.0.1:${server.address().port}/`, networkAccess: true };
    try {
      let allowNetwork = false;
      runner.setUIContext({ ...runner.getUIContext(), select: async (title, choices) => {
        assert.match(title, /Run this command once/);
        assert.ok(choices.includes('Run without network'));
        return allowNetwork ? choices.find(choice => choice.startsWith('Run with full network')) : 'Run without network';
      } }, 'interactive');
      await bash.execute('offline', networkArgs, undefined, undefined, runner.createContext()).catch(() => {});
      assert.equal(hits, 0, 'requesting networking must not override the user choosing offline');
      allowNetwork = true;
      const online = await bash.execute('online', networkArgs, undefined, undefined, runner.createContext());
      assert.match(JSON.stringify(online.content), /network-approved/);
      assert.equal(hits, 1);
      await bash.execute('user-grant', { command: networkArgs.command }, undefined, undefined, runner.createContext());
      assert.equal(hits, 2, 'the user can grant networking even if the model omitted the request');
    } finally { await new Promise(resolve => server.close(resolve)); }
    approve = true;
    session.sessionManager.appendCustomEntry('plan-mode-state', { enabled: true });
    const blocked = await runner.emitToolCall({ type: 'tool_call', toolName: 'write', toolCallId: 'write', input: { path: 'changed', content: 'bad' } });
    assert.equal(blocked.block, true);
    try { await invoke('printf bad > changed'); } catch {}
    assert.equal(existsSync(join(work, 'changed')), false);
    assert.ok(runner.getToolDefinition('subagent_supervisor'));
    assert.equal(runner.getToolDefinition('memory_search'), undefined);
    assert.equal(runner.getToolDefinition('memory_status'), undefined);
    assert.deepEqual(errors, []);
  } finally {
    await session?.extensionRunner?.emit({ type: 'session_shutdown' });
    session?.dispose(); process.chdir(original);
    rmSync(dir, { recursive: true, force: true });
  }
});
