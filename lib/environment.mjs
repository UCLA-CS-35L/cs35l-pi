import { checkProjectSubagentSettings } from './policy.mjs';
import { mkdirSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { projectPaths, stateRoot, root, sharedSkills } from './paths.mjs';
function jsonIfMissing(path, value) { if (!existsSync(path)) writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); }
export function prepareEnvironment(workspace) {
  checkProjectSubagentSettings(workspace);
  process.umask(0o077);
  const p = projectPaths(workspace);
  for (const dir of [stateRoot, p.settingsCwd, p.agentDir, p.memory, sharedSkills, join(p.agentDir, 'agents'), join(p.agentDir, 'extensions/subagent')]) { mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700); }
  jsonIfMissing(join(p.agentDir, 'auth.json'), {});
  process.env.PI_CODING_AGENT_DIR = p.agentDir;
  process.env.PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT = join(root, 'node_modules/@earendil-works/pi-coding-agent');
  process.env.CS35L_WORKSPACE = p.workspace;
  process.env.PI_MEMORY_DIR = p.memory;
  process.env.PI_MEMORY_NO_SEARCH = '1';
  process.env.PI_MEMORY_EXIT_SUMMARY = '0';
  process.env.PI_MEMORY_SUMMARIZE_TRANSITIONS = '0';
  process.env.PI_MEMORY_QMD_UPDATE = 'off';
  process.env.PI_TELEMETRY = '0';
  const settingsPath = join(p.agentDir, 'settings.json');
  jsonIfMissing(settingsPath, { defaultProvider: 'openrouter', defaultModel: 'openrouter/free', defaultThinkingLevel: 'off', compaction: { enabled: true }, defaultProjectTrust: 'never', retry: { maxRetries: 2 }, cacheWarming: { mode: 'off' } });
  jsonIfMissing(join(p.agentDir, 'pi-goal.json'), { continuationLimits: { automaticTurns: 20, noProgressTurns: 3 } });
  // Seed user defaults without replacing existing Pi configuration.
  jsonIfMissing(join(p.agentDir, 'extensions/subagent/config.json'), { globalConcurrencyLimit: 2, maxActiveAsyncRunsPerSession: 2, maxSubagentSpawnsPerSession: 20, maxSubagentSpawnsPerRun: 2, intercom: { mode: 'always' } });
  for (const name of ['scout', 'reviewer']) if (!existsSync(join(p.agentDir, 'agents', `${name}.md`))) writeFileSync(join(p.agentDir, 'agents', `${name}.md`), `---\nname: ${name}\ndescription: Read-only ${name}\ntools: read, bash, contact_supervisor\nallowNestedSubagents: false\nmodel: inherit\n---\nInvestigate the assigned task without changing workspace files. Every shell command requires user approval. Ask the parent with contact_supervisor when you need a decision. Return findings with evidence.\n`);
  return p;
}
