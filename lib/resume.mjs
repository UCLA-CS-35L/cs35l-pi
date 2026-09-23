import { agentDir } from './paths.mjs';
import { prepareEnvironment } from './environment.mjs';

// Use the public Pi selector and session storage APIs; no second session index.
export async function pickSession(cwd) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('cs35l-pi resume requires an interactive terminal.');
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const { SessionManager, SessionSelectorComponent, initTheme } = await import('@earendil-works/pi-coding-agent');
  const { ProcessTerminal, TuiMainScreen } = await import('@earendil-works/pi-tui');
  initTheme('dark');
  const ui = new TuiMainScreen(new ProcessTerminal(), false, agentDir);
  return new Promise((resolve) => {
    let finished = false;
    const finish = (path = null) => {
      if (finished) return;
      finished = true;
      ui.stop();
      resolve(path);
    };
    const selector = new SessionSelectorComponent(
      (progress, signal) => SessionManager.list(cwd, undefined, progress, signal),
      (progress, signal) => SessionManager.listAll(progress, signal),
      finish, () => finish(), () => finish(), () => ui.requestRender(),
      { showRenameHint: false },
    );
    // The upstream component starts in Current Folder. Its public list callback
    // switches scope exactly as Tab does, including showing workspace paths.
    selector.getSessionList().onToggleScope();
    ui.addChild(selector);
    ui.setFocus(selector.getSessionList());
    ui.start();
  });
}

export async function resumeSession(file) {
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const { SessionManager } = await import('@earendil-works/pi-coding-agent');
  const manager = SessionManager.open(file);
  const workspace = manager.getCwd();
  let paths;
  try { paths = prepareEnvironment(workspace); }
  catch (error) { throw new Error(`Cannot resume session in ${workspace}: ${error.message}`); }
  process.chdir(paths.workspace);
  const { createHarnessRuntime } = await import('./session.mjs');
  return createHarnessRuntime(paths, { sessionManager: manager });
}
