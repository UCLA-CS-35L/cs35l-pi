import { homedir } from 'node:os';
import { basename, dirname, resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync, existsSync } from 'node:fs';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const stateRoot = resolve(process.env.CS35L_STATE_DIR || join(homedir(), '.pi'));
export const agentDir = resolve(process.env.CS35L_STATE_DIR ? join(stateRoot, 'agent') : (process.env.PI_CODING_AGENT_DIR || join(stateRoot, 'agent')));
export const sharedSkills = join(agentDir, 'skills');
export function canonical(path) {
  const absolute = resolve(path);
  if (existsSync(absolute)) return realpathSync(absolute);
  const parent = dirname(absolute);
  if (parent === absolute) return absolute;
  return join(canonical(parent), basename(absolute));
}
export function within(path, base) { return path === base || path.startsWith(base + sep); }
export function projectPaths(workspace) {
  workspace = realpathSync(workspace);
  if (within(root, workspace) || within(workspace, root)) throw new Error('Choose a project workspace separate from the harness repository.');
  if ([stateRoot, agentDir].some(base => within(canonical(workspace), canonical(base)) || within(canonical(base), canonical(workspace)))) throw new Error('Choose a workspace separate from private Pi state.');
  return { workspace, settingsCwd: join(agentDir, 'harness'), agentDir, memory: join(agentDir, 'memory') };
}
