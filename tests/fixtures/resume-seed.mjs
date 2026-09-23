import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepareEnvironment } from '../../lib/environment.mjs';
const base = process.argv[2];
for (const name of ['alpha', 'beta']) {
  const cwd = join(base, name); mkdirSync(cwd);
  prepareEnvironment(cwd);
  const { SessionManager } = await import('@earendil-works/pi-coding-agent');
  const manager = SessionManager.create(cwd);
  manager.appendModelChange('openrouter', 'openrouter/free');
  manager.appendThinkingLevelChange('off');
  manager.appendMessage({ role: 'user', content: `Investigate ${name} project`, timestamp: Date.now() });
  manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: `RESTORED_${name.toUpperCase()}_HISTORY` }], api: 'openai-completions', provider: 'openrouter', model: 'openrouter/free', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop', timestamp: Date.now() });
  manager.appendSessionInfo(`Resume fixture ${name}`);
}

// Resuming must use the transcript's model and thinking, not today's defaults.
const settingsPath = join(process.env.PI_CODING_AGENT_DIR, 'settings.json');
const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
settings.defaultModel = 'different-default-fixture';
settings.defaultThinkingLevel = 'high';
writeFileSync(settingsPath, JSON.stringify(settings));
