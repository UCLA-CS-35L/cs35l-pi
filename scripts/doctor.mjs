import { rgPath } from '@vscode/ripgrep';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sandboxPlatform, commandPath } from '../lib/platform.mjs';
import { executeSandboxed } from '../lib/sandbox.mjs';
const platform = sandboxPlatform();
const required = platform.required;
const rg = spawnSync(rgPath, ['--version'], { encoding: 'utf8' });
console.log(`npm ripgrep: ${rg.stdout?.split('\n')[0] ?? rg.error}`);
if (rg.status !== 0) process.exit(1);
const optional = ['gcc', 'python3', 'bash', 'sbcl', 'clisp', 'node', ...(process.platform === 'darwin' ? ['clang', 'xcrun'] : [])];
let failed = false;
console.log(`Platform: ${process.platform} ${process.arch}; Node: ${process.version}`);
for (const name of [...required, ...optional]) {
  const result = spawnSync('/bin/sh', ['-c', 'command -v "$1"', 'doctor', name], { encoding: 'utf8', env: { ...process.env, PATH: commandPath(rgPath) } });
  console.log(`${name}: ${result.status === 0 ? result.stdout.trim() : 'missing'}`);
  if (required.includes(name) && result.status !== 0) failed = true;
}
const workspace = mkdtempSync(join(tmpdir(), 'cs35l-doctor-'));
try {
  if (!failed) {
    const result = await executeSandboxed({ cwd: workspace, command: 'set -e; printf "sandbox startup: OK\\n"; test ! -w /etc; rg --version; printf ok > probe', onData: bytes => process.stdout.write(bytes) });
    if (result.exitCode !== 0) failed = true;
  }
} catch (error) { failed = true; console.error(String(error)); }
finally { rmSync(workspace, { recursive: true, force: true }); }
if (failed) {
  console.error(`Required sandbox check failed. ${platform.setupHint}`);
  process.exitCode = 1;
}
