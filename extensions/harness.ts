import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import guard from './guard.ts';
import init from './init.ts';
import interrupt from './interrupt.ts';
import subagents from 'pi-subagents';
import ask from '../node_modules/pi-ask-user/index.ts';
import plan from '../node_modules/@narumitw/pi-plan-mode/dist/index.ts';
import goal from '../node_modules/@narumitw/pi-goal/dist/index.ts';
import btw from '../node_modules/@narumitw/pi-btw/dist/index.ts';
import memory from '../node_modules/pi-memory/index.ts';
import { safeSubagentInput, checkProjectSubagentSettings } from '../lib/policy.mjs';
import { Type } from 'typebox';

export default async function harness(pi: ExtensionAPI) {
  guard(pi);
  init(pi);
  interrupt(pi);
  await ask(pi);
  await plan(pi);
  await goal(pi);
  await btw(pi);
  // Upstream's startup/status/search paths probe qmd and may start embedding
  // processes even with NO_SEARCH set. Reuse only its file-backed memory paths.
  await memory(new Proxy(pi, { get(target, key) {
    if (key === 'on') return (event, handler) => {
      if (event !== 'session_start') target.on(event, handler);
    };
    if (key === 'registerTool') return (tool: ToolDefinition) => {
      if (!['memory_search', 'memory_status'].includes(tool.name)) target.registerTool(tool);
    };
    return Reflect.get(target, key);
  } }));
  // Restrict the reusable subagent engine to native read-only children. Do not expose
  // workflow scripts, command runners, schedules, external providers, or config mutation.
  const limited = new Proxy(pi, { get(target, key) {
    if (key === 'registerCommand' || key === 'registerShortcut') return () => {};
    if (key === 'registerTool') return (tool: ToolDefinition) => {
      if (tool.name !== 'subagent') return target.registerTool(tool);
      const execute = tool.execute.bind(tool);
      target.registerTool({ ...tool,
        description: 'Delegate to a read-only scout or reviewer. Children can ask the main agent for clarification using contact_supervisor. Child shell commands require user approval.',
        parameters: Type.Object({ agent: Type.Optional(Type.Union([Type.Literal('scout'), Type.Literal('reviewer')])), task: Type.Optional(Type.String()), async: Type.Optional(Type.Boolean()), context: Type.Optional(Type.Union([Type.Literal('fresh'), Type.Literal('fork')])), action: Type.Optional(Type.Union(['status','list','stop','result','doctor','guide'].map(x => Type.Literal(x)))), id: Type.Optional(Type.String()), topic: Type.Optional(Type.String()) }),
        async execute(id, args, signal, update, ctx) { checkProjectSubagentSettings(ctx.cwd); return execute(id, safeSubagentInput(args), signal, update, ctx); },
      });
    };
    return Reflect.get(target, key);
  } });
  await subagents(limited);
}
