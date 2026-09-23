import { sandboxPlatform, commandPath } from './platform.mjs';
import { rgPath } from '@vscode/ripgrep';
import { createSandboxManager } from '@carderne/sandbox-runtime';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, stateRoot, agentDir, sharedSkills, within, canonical } from './paths.mjs';

const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";

// Reuse pi-sandbox's backend, with harness-owned policy and no disable/remember-grant UI.
export async function executeSandboxed({ command, cwd, readOnly = false, domains = [], networkAccess = false, signal, timeout = 120, onData = () => {} }) {
  const platform = sandboxPlatform();
  if (signal?.aborted) throw new Error('Command cancelled');
  cwd = realpathSync(cwd);
  if (within(cwd, root) || within(root, cwd)) throw new Error('Harness repository cannot be an execution workspace');
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'cs35l-command-')));
  mkdirSync(join(scratch, 'home'));
  const manager = createSandboxManager();
  const runtimeDir = resolve(dirname(fileURLToPath(import.meta.resolve('@carderne/sandbox-runtime'))), '..');
  const config = {
    ripgrep: { command: rgPath },
    // Absent allowedDomains grants full networking; [] routes through a
    // deny-all proxy. Filesystem restrictions remain active on both platforms.
    network: { ...(networkAccess === true ? {} : { allowedDomains: domains }), deniedDomains: [], allowLocalBinding: networkAccess === true, allowAllUnixSockets: false },
    filesystem: {
      denyRead: [...new Set([...platform.privateRoots, homedir(), tmpdir(), '/tmp', '/var/tmp', stateRoot, agentDir, root].map(canonical))],
      allowRead: [cwd, scratch, dirname(rgPath), dirname(process.execPath), join(root, 'skills'), sharedSkills, ...(process.platform === 'linux' ? [join(runtimeDir, 'vendor/seccomp')] : [])].map(canonical),
      allowWrite: readOnly ? [scratch] : [cwd, scratch],
      denyWrite: [root, stateRoot, agentDir, '/tmp/claude', '/private/tmp/claude', join(homedir(), '.npm/_logs'), join(homedir(), '.claude/debug'), join(cwd, '.git'), join(cwd, '.pi'), join(cwd, '.agents')].map(canonical),
    },
    enableWeakerNestedSandbox: false,
    enableWeakerNetworkIsolation: false,
  };
  try {
    await manager.initialize(config, async ({ host, port }) => {
      onData(Buffer.from(`\n[Sandbox blocked network access to ${host}:${port}. Request networkAccess: true or networkDomains in a new command approval to access it.]\n`));
      return false;
    });
    // Linux mounts proxy sockets before filesystem denies. Re-allow only these
    // invocation-specific sockets so hiding /tmp does not hide the bridge too.
    if (process.platform === 'linux' && !networkAccess) {
      const sockets = [manager.getLinuxHttpSocketPath(), manager.getLinuxSocksSocketPath()].filter(Boolean);
      config.filesystem.allowRead.push(...new Set(sockets));
    }
    const wrapped = await manager.wrapWithSandbox(`export TMPDIR=${shellQuote(scratch)}; ${command}`, '/bin/bash', config, signal);
    // Allowlist instead of scrubbing known API key names. No host dotfiles or shell hooks.
    const env = { PATH: commandPath(rgPath), HOME: join(scratch, 'home'), TMPDIR: scratch,
      LANG: platform.locale, LC_ALL: platform.locale, TERM: 'dumb', NODE_USE_ENV_PROXY: '1',
      XDG_CACHE_HOME: join(scratch, 'cache'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
    const code = await new Promise((resolveCode, reject) => {
      const child = spawn('/bin/bash', ['--noprofile', '--norc', '-c', wrapped], { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let aborted = false, timedOut = false;
      const kill = () => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } };
      const cancel = () => { aborted = true; kill(); };
      const timer = setTimeout(() => { timedOut = true; kill(); }, Math.min(Math.max(timeout, 1), 600) * 1000);
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      child.stdout.on('data', onData); child.stderr.on('data', onData);
      child.once('error', error => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(error); });
      child.once('exit', (exitCode, exitSignal) => {
        kill(); // Do not leave daemons holding inherited pipes or approval scope alive.
        clearTimeout(timer); signal?.removeEventListener('abort', cancel);
        if (aborted || timedOut) reject(new Error(aborted ? 'Command cancelled' : 'Command timed out'));
        else resolveCode(exitCode ?? (exitSignal ? 128 : 1));
      });
    });
    return { exitCode: code };
  } finally { await manager.reset(); rmSync(scratch, { recursive: true, force: true }); }
}
