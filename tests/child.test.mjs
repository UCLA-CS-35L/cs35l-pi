import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { realpathSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

test('native background child forwards clarification and command approval to parent', { timeout: 90000 }, async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cs35l-child-')));
  process.env.CS35L_STATE_DIR = join(dir, 'state');
  const work = join(dir, 'work'); mkdirSync(work);
  let requests = 0;
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const isChild = body.tools?.some(t => t.function?.name === 'contact_supervisor');
    if (isChild) requests++;
    const replies = body.messages.filter(m => m.role === 'tool');
    const tool = !isChild ? null : replies.length === 0 ? ['contact_supervisor', { reason: 'need_decision', message: 'Which file should I inspect?' }]
      : replies.length === 1 ? ['bash', { command: 'printf child-ok; printf forbidden > child-write' }] : null;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const chunk = (delta, finish_reason = null) => res.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    chunk({ role: 'assistant', ...(tool ? { tool_calls: [{ index: 0, id: `call${requests}`, type: 'function', function: { name: tool[0], arguments: JSON.stringify(tool[1]) } }] } : { content: 'Inspection complete.' }) });
    chunk({}, tool ? 'tool_calls' : 'stop'); res.end('data: [DONE]\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { prepareEnvironment } = await import('../lib/environment.mjs');
  const { createHarnessRuntime } = await import('../lib/session.mjs');
  const paths = prepareEnvironment(work);
  writeFileSync(join(paths.agentDir, 'models.json'), JSON.stringify({ providers: { fixture: { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'fixture-only', models: [{ id: 'fixture', name: 'Fixture', contextWindow: 32000, maxTokens: 1024 }] } } }));
  const original = process.cwd(); process.chdir(work);
  let session, runId;
  try {
    ({ session } = await createHarnessRuntime(paths, { providerId: 'fixture', modelId: 'fixture' }));
    await session.bindExtensions({ mode: 'print', onError: e => { throw e; } });
    const runner = session.extensionRunner;
    let approvals = 0;
    runner.setUIContext({ ...runner.getUIContext(), select: async (title, choices) => {
      assert.match(title, /child/); assert.match(title, /read-only/); approvals++; return choices[0];
    } }, 'interactive');
    const call = (name, args) => runner.getToolDefinition(name).execute('fixture', args, undefined, undefined, runner.createContext());
    const launched = await call('subagent', { agent: 'scout', task: 'Ask which file, run a shell inspection, then report.' });
    assert.notEqual(launched.isError, true, JSON.stringify(launched));
    runId = launched.details?.runId ?? launched.details?.id;
    let replied = false, status;
    const until = Date.now() + 60000;
    while (Date.now() < until) {
      const pending = await call('subagent_supervisor', { action: 'pending' });
      const rows = pending.details?.pending ?? pending.details?.requests;
      if (!replied && Array.isArray(rows) && rows.length) {
        const reply = await call('subagent_supervisor', { action: 'reply', replyTo: rows[0].id, message: 'Inspect the assignment; do not modify it.' });
        assert.notEqual(reply.isError, true, JSON.stringify(reply)); replied = true;
      }
      status = await call('subagent', { action: 'status', ...(runId ? { id: runId } : {}) });
      if (requests >= 3) break;
      await delay(250);
    }
    assert.ok(replied, JSON.stringify({ launched, status }));
    assert.equal(approvals, 1, JSON.stringify(status));
    assert.ok(requests >= 3, JSON.stringify(status));
    assert.equal(existsSync(join(work, 'child-write')), false);
  } finally {
    if (runId && session) {
      const runner = session.extensionRunner;
      await runner.getToolDefinition('subagent').execute('stop', { action: 'stop', id: runId }, undefined, undefined, runner.createContext()).catch(() => {});
    }
    await session?.extensionRunner?.emit({ type: 'session_shutdown' });
    // Completion notifications can start a parent turn. Settle it before
    // removing its model endpoint or session storage.
    await session?.abort();
    session?.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    process.chdir(original); rmSync(dir, { recursive: true, force: true });
  }
});
