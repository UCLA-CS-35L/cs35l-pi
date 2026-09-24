import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, copyFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const script = readFileSync(join(root, 'install.sh'), 'utf8');
const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
};

test('piped installer clones a pinned revision, rebases upgrades with autostash, and creates a working launcher', () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'pi-installer-')));
  try {
    const repo = join(base, 'upstream'), home = join(base, 'home'), bin = join(base, 'tools');
    for (const dir of [repo, home, bin, join(repo, 'lib'), join(repo, 'scripts')]) mkdirSync(dir, { recursive: true });
    writeFileSync(join(repo, 'package.json'), '{"name":"installer-fixture","type":"module"}');
    writeFileSync(join(repo, 'package-lock.json'), '{}');
    writeFileSync(join(repo, 'lib/session.mjs'), '');
    writeFileSync(join(repo, 'preferences.txt'), 'original\n');
    writeFileSync(join(repo, 'lib/paths.mjs'), `export const root = new URL('..', import.meta.url).pathname;`);
    for (const name of ['install-launcher.mjs', 'cs35l-pi.sh']) copyFileSync(join(root, 'scripts', name), join(repo, 'scripts', name));
    git(repo, 'init', '-q'); git(repo, 'add', '.');
    git(repo, '-c', 'user.name=Installer Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture');
    const ref = git(repo, 'rev-parse', 'HEAD');
    const log = join(base, 'npm.log');
    writeFileSync(join(bin, 'uname'), '#!/bin/sh\nprintf Darwin\n', { mode: 0o755 });
    // Package work is stubbed; Git, piping, cleanup, and launcher run for real.
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$INSTALL_TEST_LOG"\n', { mode: 0o755 });
    const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, CS35L_REPO_URL: repo, CS35L_REPO_REF: ref, CS35L_INSTALL_DIR: join(home, '.pi/repo/cs35l-pi'), INSTALL_TEST_LOG: log, GIT_COMMITTER_NAME: 'Installer Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' };
    const run = () => spawnSync('/bin/bash', [], { input: script, encoding: 'utf8', env, cwd: base });
    let r = run(); assert.equal(r.status, 0, r.stderr);
    const destination = env.CS35L_INSTALL_DIR;
    assert.equal(git(destination, 'rev-parse', 'HEAD'), ref);
    assert.ok(existsSync(join(home, '.local/bin/cs35l-pi')));
    assert.ok(!existsSync(join(home, '.pi/agent/auth.json')));
    assert.ok(!existsSync(join(home, '.pi/repo/course-workspace')));
    assert.ok(!readdirSync(join(home, '.pi/repo')).some(s => s.startsWith('.cs35l-pi-install')));
    assert.match(readFileSync(log, 'utf8'), /ci\nrun doctor\nrun check -- .*\/work\n/);
    writeFileSync(join(destination, 'keep-local-edit'), 'keep');
    git(destination, 'add', 'keep-local-edit');
    git(destination, '-c', 'user.name=Installer Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'local commit');
    writeFileSync(join(destination, 'preferences.txt'), 'my dirty changes\n');
    writeFileSync(join(repo, 'upstream-change'), 'new release');
    git(repo, 'add', '.');
    git(repo, '-c', 'user.name=Installer Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'upgrade');
    env.CS35L_REPO_REF = git(repo, 'rev-parse', 'HEAD');
    r = run(); assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Updating checkout with rebase and autostash/);
    assert.equal(readFileSync(join(destination, 'preferences.txt'), 'utf8'), 'my dirty changes\n');
    assert.equal(readFileSync(join(destination, 'upstream-change'), 'utf8'), 'new release');
    git(destination, 'merge-base', '--is-ancestor', env.CS35L_REPO_REF, 'HEAD');
    assert.equal(readFileSync(join(destination, 'keep-local-edit'), 'utf8'), 'keep');
    const work = join(base, 'project with spaces'); mkdirSync(work);
    r = spawnSync(join(home, '.local/bin/cs35l-pi'), ['resume'], { env, cwd: work, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(readFileSync(log, 'utf8').includes(`start -- --resume ${work}`));
    r = spawnSync('/bin/bash', [], { input: script, env: { ...env, CS35L_REPO_REF: 'nonexistent', CS35L_INSTALL_DIR: join(home, '.pi/repo/failed') }, encoding: 'utf8', cwd: base });
    assert.notEqual(r.status, 0);
    assert.ok(!existsSync(join(home, '.pi/repo/failed')));
    assert.ok(!readdirSync(join(home, '.pi/repo')).some(s => s.startsWith('.cs35l-pi-install')));
    const beforeConflictLog = readFileSync(log, 'utf8');
    writeFileSync(join(repo, 'preferences.txt'), 'upstream changed same line\n');
    git(repo, 'add', '.');
    git(repo, '-c', 'user.name=Installer Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'conflicting upgrade');
    env.CS35L_REPO_REF = git(repo, 'rev-parse', 'HEAD');
    r = run(); assert.notEqual(r.status, 0);
    assert.match(r.stderr, /conflicts/);
    assert.ok(git(destination, 'ls-files', '--unmerged'));
    assert.equal(readFileSync(log, 'utf8'), beforeConflictLog, 'no install work after a conflict');
    assert.ok(readFileSync(join(destination, 'preferences.txt'), 'utf8').includes('my dirty changes'));
    r = spawnSync('/bin/bash', [], { input: script, env: { ...env, CS35L_REPO_URL: '' }, encoding: 'utf8', cwd: base });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /different origin/);

  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('dependency diagnostics distinguish Ubuntu, RHEL, other Linux, and macOS', () => {
  const base = mkdtempSync(join(tmpdir(), 'pi-installer-deps-'));
  try {
    const release = join(base, 'os-release');
    // Exercise diagnostics independently of packages installed on the runner.
    const source = script.replaceAll('/etc/os-release', release).replace('main "$@"', `
command() { return 1; }
uname() { printf '%s' "$TEST_SYSTEM"; }
check_sandbox_dependencies
`);
    for (const [id, system, pattern] of [
      ['ubuntu', 'Linux', /sudo apt install bubblewrap socat/],
      ['rhel', 'Linux', /sudo dnf install bubblewrap socat/],
      ['arch', 'Linux', /distribution package manager/],
      ['ubuntu', 'Darwin', null],
    ]) {
      writeFileSync(release, `ID=${id}\n`);
      const r = spawnSync('/bin/bash', [], { input: source, encoding: 'utf8', env: { ...process.env, TEST_SYSTEM: system } });
      assert.equal(r.status, pattern ? 1 : 0, r.stderr);
      if (pattern) assert.match(r.stderr, pattern);
      else assert.equal(r.stderr, '');
    }
  } finally { rmSync(base, { recursive: true, force: true }); }
});
