import test from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync, mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import init from '../extensions/init.ts';

test('/init reuses upstream prompts without trusting project configuration or overwriting files', async () => {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'cs35l-init-')));
  const prompts = [], notices = [];
  let command;
  init({ registerCommand(name, definition) { assert.equal(name, 'init'); command = definition; }, sendUserMessage(message) { prompts.push(message); } });
  const ctx = { cwd, isProjectTrusted: () => false, ui: { notify: message => notices.push(message) } };
  try {
    await command.handler('', ctx);
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /AGENTS\.md/);
    assert.equal(existsSync(join(cwd, 'AGENTS.md')), false, 'generation must be delegated to normal tools');
    writeFileSync(join(cwd, 'AGENTS.md'), 'Keep this guidance.');
    await command.handler('', ctx);
    assert.equal(prompts.length, 1);
    assert.match(notices.at(-1), /--force/);
    await command.handler('--force', ctx);
    assert.equal(prompts.length, 2);
    assert.match(prompts[1], /preserve accurate repository-specific guidance/);
    assert.equal(readFileSync(join(cwd, 'AGENTS.md'), 'utf8'), 'Keep this guidance.');
    assert.equal(ctx.isProjectTrusted(), false);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
