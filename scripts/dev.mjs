import { mkdirSync, cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { root, stateRoot } from '../lib/paths.mjs';
import { prepareEnvironment } from '../lib/environment.mjs';
const [action = 'start', ...args] = process.argv.slice(2);
const sample = resolve(root, '../course-workspace');
if (action === 'setup') {
  mkdirSync(sample, { recursive: true });
  for (const name of readdirSync(join(root, 'fixtures/course'))) if (!existsSync(join(sample, name))) cpSync(join(root, 'fixtures/course', name), join(sample, name), { recursive: true });
  prepareEnvironment(sample);
  console.log(`Pi and extensions are installed locally. Workspace: ${sample}\nPrivate state: ${stateRoot}\nStart: npm start -- ${sample}`);
} else if (action === 'start' && args.includes('--resume')) {
  const { pickSession, resumeSession } = await import('../lib/resume.mjs');
  const file = await pickSession(resolve(args.find(x => !x.startsWith('--')) || process.cwd()));
  if (file) {
    const result = await resumeSession(file);
    const { InteractiveMode } = await import('@earendil-works/pi-coding-agent');
    await new InteractiveMode(result.runtime).run();
  }
} else if (action === 'start' || action === 'check') {
  const workspace = resolve(args.find(x => !x.startsWith('--')) || sample);
  const paths = prepareEnvironment(workspace);
  process.chdir(paths.workspace);
  const { createHarnessRuntime } = await import('../lib/session.mjs');
  const result = await createHarnessRuntime(paths);
  if (action === 'check') {
    await result.session.bindExtensions({ mode: 'print', onError: error => { throw error; } });
    console.log(JSON.stringify({ workspace, model: result.session.model?.id, tools: result.session.getAllTools().map(t => t.name), extensionErrors: result.extensionsResult.errors, skills: result.services.resourceLoader.getSkills().skills.map(s => s.name) }, null, 2));
    await result.session.extensionRunner?.emit({ type: 'session_shutdown' });
    result.session.dispose();
  } else {
    if (!process.stdin.isTTY) throw new Error('Interactive terminal required. Use npm run check for a credential-free load test.');
    const { InteractiveMode } = await import('@earendil-works/pi-coding-agent');
    await new InteractiveMode(result.runtime).run();
  }
} else if (action === 'clean-cache') {
  rmSync(join(root, '../.cs35l-pi-dev/npm-cache'), { recursive: true, force: true });
  console.log('Removed only the development npm cache. Credentials, sessions, memory, and workspaces preserved.');
} else throw new Error('Use setup, start, check, or clean-cache');
