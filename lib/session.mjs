import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { root } from './paths.mjs';

export async function createHarnessRuntime(paths, { modelId, providerId, sessionManager } = {}) {
  const sdk = await import('@earendil-works/pi-coding-agent');
  const createRuntime = async ({ cwd, agentDir, sessionManager: manager, sessionStartEvent }) => {
    if (resolve(cwd) !== paths.workspace) throw new Error('Restart the harness launcher to change project workspace');
    // File storage uses a private cwd so no project .pi/settings.json is executable configuration.
    const settingsManager = sdk.SettingsManager.create(paths.settingsCwd, agentDir, { projectTrusted: false });
    const modelRuntime = await sdk.ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: join(agentDir, 'models.json'), allowModelNetwork: false });
    const restoredModel = manager.buildSessionContext().model;
    const provider = providerId ?? restoredModel?.provider ?? settingsManager.getDefaultProvider() ?? 'openrouter';
    const id = modelId ?? restoredModel?.modelId ?? settingsManager.getDefaultModel() ?? 'openrouter/free';
    const selectedModel = modelRuntime.getModel(provider, id);
    if (!selectedModel) throw new Error(`Configured model ${provider}/${id} unavailable; no provider fallback is allowed`);
    const instructions = () => [readFileSync(join(root, 'config/harness-instructions.md'), 'utf8'), `Shared skills directory: ${join(agentDir, 'skills')}. Shared memory directory: ${paths.memory}.`];
    const services = await sdk.createAgentSessionServices({ cwd, agentDir, settingsManager, modelRuntime,
      resourceLoaderOptions: {
        noExtensions: true, noThemes: true, noPromptTemplates: true, noSkills: true,
        extensionFactories: [(pi) => {
          pi.on('model_select', async (event) => {
            if (event.source === 'restore') return;
            settingsManager.setDefaultModelAndProvider(event.model.provider, event.model.id);
            await settingsManager.flush();
          });
          pi.on('thinking_level_select', async (event, ctx) => {
            settingsManager.setDefaultThinkingLevel(event.level);
            if (ctx.model) settingsManager.setModelThinkingLevel(ctx.model.provider, ctx.model.id, event.level);
            await settingsManager.flush();
          });
          pi.on('session_shutdown', async () => { await settingsManager.flush(); });
        }],
        additionalExtensionPaths: [join(root, 'extensions/harness.ts')],
        additionalSkillPaths: [join(root, 'skills')],
        // Recheck optional project skills on every reload. Pi treats missing
        // additionalSkillPaths as errors, so only pass the project path if present.
        skillsOverride: () => sdk.loadSkills({
          cwd, agentDir, includeDefaults: true,
          skillPaths: [join(root, 'skills'), ...(existsSync(join(cwd, 'skills')) ? [join(cwd, 'skills')] : [])],
        }),
        appendSystemPrompt: instructions(),
        systemPromptOverride: () => undefined,
        appendSystemPromptOverride: instructions,
      },
    });
    const errors = services.resourceLoader.getExtensions().errors;
    if (errors.length) throw new Error('Extension load failure: ' + JSON.stringify(errors));
    const result = await sdk.createAgentSessionFromServices({ services, sessionManager: manager, model: selectedModel, sessionStartEvent, excludeTools: ['powershell','grep','find','ls'] });
    return { ...result, services, diagnostics: services.diagnostics };
  };
  const manager = sessionManager ?? sdk.SessionManager.create(paths.workspace);
  const initial = await createRuntime({ cwd: paths.workspace, agentDir: paths.agentDir, sessionManager: manager });
  const runtime = new sdk.AgentSessionRuntime(initial.session, initial.services, createRuntime, initial.diagnostics);
  return { ...initial, runtime };
}
