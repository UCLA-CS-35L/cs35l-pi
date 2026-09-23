import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, projectPaths } from '../lib/paths.mjs';
import { checkFilePath } from '../lib/policy.mjs';
import { executeSandboxed } from '../lib/sandbox.mjs';

test('harness source and its parent can be workspaces, with normal write and read-only rules', async () => {
  assert.equal(projectPaths(root).workspace, root);
  assert.equal(projectPaths(dirname(root)).workspace, dirname(root));
  const work = mkdtempSync(join(root, '.workspace-test-'));
  try {
    assert.equal(projectPaths(work).workspace, work);
    assert.equal(checkFilePath('probe', work, true, false), join(work, 'probe'));
    const result = await executeSandboxed({ cwd: root, command: `printf ok > '${work}/probe'` });
    assert.equal(result.exitCode, 0);
    assert.equal(readFileSync(join(work, 'probe'), 'utf8'), 'ok');
    assert.throws(() => checkFilePath('probe', work, true, true), /read-only/);
    const readonly = await executeSandboxed({ cwd: root, command: `printf changed > '${work}/probe'`, readOnly: true });
    assert.notEqual(readonly.exitCode, 0);
    assert.equal(readFileSync(join(work, 'probe'), 'utf8'), 'ok');
  } finally { rmSync(work, { recursive: true, force: true }); }
});

test('the default ~/.pi/repo layout permits source writes while protecting agent state', () => {
  const base = mkdtempSync(join(tmpdir(), 'pi-repo-layout-'));
  try {
    const state = join(base, '.pi'), repo = join(state, 'repo/cs35l-pi');
    mkdirSync(join(repo, 'lib'), { recursive: true });
    mkdirSync(join(state, 'agent'));
    for (const file of ['paths.mjs', 'policy.mjs']) copyFileSync(join(root, 'lib', file), join(repo, 'lib', file));
    writeFileSync(join(repo, 'package.json'), '{"type":"module"}');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { root, agentDir, projectPaths } from './lib/paths.mjs';
      import { checkFilePath } from './lib/policy.mjs';
      assert.equal(projectPaths(root).workspace, root);
      assert.equal(checkFilePath('README.md', root, true, false), root + '/README.md');
      assert.throws(() => projectPaths(agentDir), /private Pi state/);
      assert.throws(() => checkFilePath(agentDir + '/auth.json', root, true, false), /outside/);
    `], { cwd: repo, env: { ...process.env, CS35L_STATE_DIR: state }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
