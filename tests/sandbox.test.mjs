import test from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeSandboxed } from '../lib/sandbox.mjs';
import { checkFilePath, safeSubagentInput } from '../lib/policy.mjs';
import { createServer } from 'node:http';
async function fixture(fn) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cs35l-test-sandbox-')));
  const work = join(dir, 'workspace'); mkdirSync(work);
  try { await fn(dir, work); } finally { rmSync(dir, { recursive: true, force: true }); }
}
async function run(cwd, command, options = {}) {
  let output = '';
  const result = await executeSandboxed({ cwd, command, ...options, onData: b => output += b.toString() });
  return { ...result, output };
}
test('sandbox permits assignment writes, denies host file reads, and strips credentials', async () => fixture(async (dir, work) => {
  writeFileSync(join(dir, 'secret'), 'host-only');
  process.env.CS35L_TEST_API_KEY = 'must-not-be-inherited';
  const result = await run(work, `set -e; printf ok > result; test -z "$CS35L_TEST_API_KEY"; if cat '${dir}/secret' 2>/dev/null; then exit 91; fi; test ! -w /etc`);
  assert.equal(result.exitCode, 0, result.output); assert.equal(readFileSync(join(work, 'result'), 'utf8'), 'ok');
  delete process.env.CS35L_TEST_API_KEY;
}));
test('read-only execution cannot write even via Python', async () => fixture(async (_dir, work) => {
  const result = await run(work, 'python3 -c "open(\'changed\',\'w\').write(\'bad\')"', { readOnly: true });
  assert.notEqual(result.exitCode, 0); assert.equal(existsSync(join(work, 'changed')), false);
}));
test('outbound network is denied by default', async () => fixture(async (_dir, work) => {
  const result = await run(work, 'curl --connect-timeout 2 --max-time 4 -fsS https://example.com', { timeout: 8 });
  assert.notEqual(result.exitCode, 0, result.output);
}));
test('full network grant enables direct TCP only for that invocation and retains filesystem isolation', async () => fixture(async (dir, work) => {
  let hits = 0;
  const server = createServer((_req, res) => { hits++; res.end('network-approved'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  writeFileSync(join(dir, 'secret'), 'hidden');
  const command = `curl --noproxy '*' --connect-timeout 1 --max-time 2 -fsS http://127.0.0.1:${server.address().port}/`;
  try {
    assert.notEqual((await run(work, command)).exitCode, 0);
    const granted = await run(work, `${command} && ! cat '${dir}/secret' 2>/dev/null && test ! -w /etc`, { networkAccess: true });
    assert.equal(granted.exitCode, 0, granted.output);
    assert.match(granted.output, /network-approved/);
    assert.notEqual((await run(work, command)).exitCode, 0);
    assert.equal(hits, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
}));
test('canonical file checks reject symlink escapes and protected configuration', async () => fixture(async (dir, work) => {
  symlinkSync(dir, join(work, 'escape'));
  assert.throws(() => checkFilePath('escape/secret', work, false, false), /outside/);
  assert.throws(() => checkFilePath('.pi/extensions/code.ts', work, true, false), /protected/);
  assert.throws(() => checkFilePath('file', work, true, true), /read-only/);
}));
test('subagent wrapper rejects executable workflows, host gates, and model overrides', () => {
  for (const extra of [{ workflowScript: 'return runs.host()' }, { gate: 'touch bad' }, { model: 'paid' }, { extensions: [] }, { cwd: '/etc' }]) {
    assert.throws(() => safeSubagentInput({ agent: 'scout', task: 'inspect', ...extra }), /do not accept/);
  }
  assert.equal(safeSubagentInput({ agent: 'scout', task: 'inspect' }).model, 'inherit');
});

test('common toolchains execute inside the sandbox', async () => fixture(async (_dir, work) => {
  writeFileSync(join(work, 'hello.c'), '#include <stdio.h>\nint main(void) { puts("c-ok"); return 0; }\n');
  const result = await run(work, `set -e
cc hello.c -o hello
./hello
python3 -c 'print("python-ok")'
node -e 'console.log("node-ok")'
bash -c 'printf "bash-ok\\n"'
`, { timeout: 60 });
  assert.equal(result.exitCode, 0, result.output);
  for (const name of ['c', 'python', 'node', 'bash']) assert.match(result.output, new RegExp(`${name}-ok`));
}));

test('restricted networking uses the domain proxy and does not permit direct TCP', async () => fixture(async (_dir, work) => {
  const proxyEnv = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'];
  const saved = Object.fromEntries(proxyEnv.map(key => [key, process.env[key]]));
  for (const key of proxyEnv) delete process.env[key];
  const server = createServer((_req, res) => res.end('proxy-ok'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    const result = await run(work, `curl --noproxy '' --max-time 4 -fsS '${url}'`, { domains: ['127.0.0.1'] });
    assert.equal(result.exitCode, 0, result.output);
    assert.match(result.output, /proxy-ok/);
    const denied = await run(work, `curl --noproxy '*' --max-time 2 -fsS '${url}'`, { domains: ['127.0.0.1'] });
    assert.notEqual(denied.exitCode, 0, denied.output);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const key of proxyEnv) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}));
