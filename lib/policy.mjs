import { homedir } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { canonical, within, root, stateRoot, agentDir, sharedSkills } from './paths.mjs';
export function isPlanMode(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].type === 'custom' && entries[i].customType === 'plan-mode-state') return entries[i].data?.enabled === true;
  }
  return false;
}
export function checkFilePath(input, cwd, write, readOnly, extraReadRoots = []) {
  if (typeof input !== 'string' || input.includes('\0')) throw new Error('Invalid file path');
  const target = canonical(resolve(cwd, input.startsWith('~/') ? join(homedir(), input.slice(2)) : input));
  const workspace = canonical(cwd);
  const skill = within(target, canonical(sharedSkills));
  const projectSkill = within(target, join(workspace, '.pi', 'skills'));
  const permitted = skill || within(target, workspace) || (!write && extraReadRoots.some(p => within(target, canonical(p))));
  if (!permitted) throw new Error('File access is outside the project workspace');
  if (write && readOnly) throw new Error('Workspace is read-only in this session');
  if (write && !skill && [root, stateRoot, agentDir].some(p => within(target, canonical(p)))) throw new Error('Harness state is protected');
  if (write && !projectSkill && ['.git', '.pi', '.agents'].some(p => within(target, join(workspace, p)))) throw new Error('Executable project configuration and Git metadata are protected; edit project skills under skills/');
  return target;
}
export function safeSubagentInput(input) {
  const management = new Set(['status', 'list', 'stop', 'result', 'doctor', 'guide']);
  const allowed = new Set(['agent', 'task', 'async', 'context', 'action', 'id', 'topic']);
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new Error(`Harness subagents do not accept ${key}`);
  if (input.action && !management.has(input.action)) throw new Error('Unsupported harness subagent action');
  if (!input.action && (!['scout', 'reviewer'].includes(input.agent) || typeof input.task !== 'string' || !input.task.trim())) throw new Error('Choose scout or reviewer and supply a task');
  if (input.context && !['fresh', 'fork'].includes(input.context)) throw new Error('Invalid child context');
  return { ...input, agentScope: 'user', model: 'inherit', acceptance: false, async: true };
}

// The upstream engine reads ancestor settings even with agentScope=user. Reject
// project subagent overrides before loading it or starting any child.
export function checkProjectSubagentSettings(cwd) {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    const file = join(dir, '.pi', 'settings.json');
    if (existsSync(file)) {
      const settings = JSON.parse(readFileSync(file, 'utf8'));
      if (Object.hasOwn(settings, 'subagents')) throw new Error(`Project subagent overrides are unavailable in the harness: ${file}`);
    }
    if (dirname(dir) === dir) break;
  }
}
