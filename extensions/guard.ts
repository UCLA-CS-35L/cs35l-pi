import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBashToolDefinition, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { registerRequiredChildExtensions } from 'pi-subagents/required-child-extensions';
import { registerSubagentCapabilityCeiling } from 'pi-subagents/capability-ceiling';
import { ApprovalBroker, requestApproval } from '../lib/approval.mjs';
import { executeSandboxed } from '../lib/sandbox.mjs';
import { checkFilePath, isPlanMode } from '../lib/policy.mjs';
import { root, sharedSkills } from '../lib/paths.mjs';

export default function guard(pi: ExtensionAPI, child = false) {
  let context: ExtensionContext | undefined;
  let broker: ApprovalBroker | undefined;
  let brokerDir: string | undefined;
  let required: ReturnType<typeof registerRequiredChildExtensions> | undefined;
  let ceiling: ReturnType<typeof registerSubagentCapabilityCeiling> | undefined;
  const readonly = (ctx: ExtensionContext) => child || isPlanMode(ctx.sessionManager.getBranch());
  const extraRead = [join(root, 'skills'), sharedSkills];
  pi.on('session_start', async (_event, ctx) => {
    context = ctx;
    if (child) return;
    required?.dispose(); ceiling?.dispose(); await broker?.close();
    if (brokerDir) rmSync(brokerDir, { recursive: true, force: true });
    brokerDir = mkdtempSync(join(tmpdir(), 'cs35l-approval-'));
    broker = new ApprovalBroker(join(brokerDir, 'channel.sock'), async (request, signal) => {
      if (!context?.hasUI || request.cwd !== context.cwd || signal.aborted) return { approved: false };
      const readOnly = request.readOnly || readonly(context);
      const body = `Agent: ${request.agent}\nDirectory: ${request.cwd}\nWorkspace: ${readOnly ? 'read-only' : 'writable'}\nRequested network: ${request.networkAccess ? 'full access (internet + localhost/LAN)' : request.domains.length ? request.domains.join(', ') : 'none'}\n\n${request.command}\n\nApproval covers this invocation and its subprocesses only.`;
      const offline = 'Run without network';
      const limited = 'Run with requested domains';
      const full = 'Run with full network access (internet + localhost/LAN)';
      const choices = request.networkAccess ? [full, offline]
        : request.domains.length ? [limited, offline, full] : [offline, full];
      const choice = await context.ui.select(`Run this command once?\n${body}`, [...choices, 'Cancel'], { signal });
      return { approved: !signal.aborted && choices.includes(choice ?? ''), readOnly,
        networkAccess: choice === full, domains: choice === limited ? request.domains : [] };
    });
    await broker.start();
    process.env.CS35L_APPROVAL_SOCKET = broker.socketPath;
    process.env.CS35L_APPROVAL_TOKEN = broker.token;
    required = registerRequiredChildExtensions({ sessionId: ctx.sessionManager.getSessionId(), extensions: [{ id: 'cs35l-execution-guard', path: join(root, 'extensions/child.ts') }] });
    ceiling = registerSubagentCapabilityCeiling({ sessionId: ctx.sessionManager.getSessionId(), source: 'harness', ceiling: { allowedAgents: ['scout', 'reviewer'], allowedTools: ['read', 'bash', 'contact_supervisor'], denyExtensions: true } });
    ctx.ui.setStatus('cs35l', 'CS35L · approval per command · sandbox required');
  });
  pi.on('session_shutdown', async () => {
    required?.dispose(); ceiling?.dispose(); await broker?.close();
    if (brokerDir) rmSync(brokerDir, { recursive: true, force: true });
  });
  pi.on('tool_call', async (event, ctx) => {
    context = ctx;
    try {
      if (['read', 'write', 'edit'].includes(event.toolName)) checkFilePath(event.input.path, ctx.cwd, event.toolName !== 'read', readonly(ctx), extraRead);
      // Search tools spawn helper processes in Pi; use approved bash commands instead.
      if (['grep', 'find', 'ls', 'powershell'].includes(event.toolName)) throw new Error('Use the approved bash tool for command-based inspection');
      if (readonly(ctx) && ['memory_write', 'memory_forget', 'memory_restore', 'scratchpad'].includes(event.toolName)) throw new Error('Memory updates are unavailable during read-only work');
    } catch (e) { return { block: true, reason: String(e) }; }
  });
  async function operations(ctx: ExtensionContext, command: string, domains: string[], signal?: AbortSignal, networkAccess = false) {
    const decision = await requestApproval(process.env.CS35L_APPROVAL_SOCKET, process.env.CS35L_APPROVAL_TOKEN,
      { command, cwd: ctx.cwd, agent: child ? `child ${ctx.sessionManager.getSessionId()}` : 'main', domains, networkAccess, readOnly: readonly(ctx) }, signal);
    return { exec: (_command, cwd, options) => executeSandboxed({ ...options, command, cwd, domains: decision.domains, networkAccess: decision.networkAccess, readOnly: decision.readOnly || readonly(ctx) }) };
  }
  const base = createBashToolDefinition(process.cwd(), { exposeSessionEnvironment: false });
  pi.registerTool({ ...base,
    description: 'Run a shell command after user approval in the harness sandbox. For network operations, request networkAccess: true for full networking, or networkDomains for specific DNS hosts. The user chooses the network grant for this invocation; filesystem restrictions remain active.',
    parameters: Type.Object({ command: Type.String(), timeout: Type.Optional(Type.Number({ minimum: 1, maximum: 600 })), networkDomains: Type.Optional(Type.Array(Type.String(), { maxItems: 20 })), networkAccess: Type.Optional(Type.Boolean({ description: 'Request full network access, including internet and localhost/LAN, for this command. Requires user approval.' })) }),
    async execute(id, args, signal, onUpdate, ctx) {
      const ops = await operations(ctx, args.command, args.networkDomains ?? [], signal, args.networkAccess ?? false);
      const tool = createBashToolDefinition(ctx.cwd, { operations: ops, exposeSessionEnvironment: false });
      return tool.execute(id, args, signal, onUpdate, ctx);
    },
  });
  pi.on('user_bash', async (event, ctx) => ({ operations: {
    exec: async (command, cwd, options) => {
      const ops = await operations(ctx, command, [], options.signal);
      return ops.exec(command, cwd, options);
    },
  } }));
}
