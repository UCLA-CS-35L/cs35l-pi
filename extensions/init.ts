import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { handleInitCommand } from 'pi-agentsmd';

export default function init(pi: ExtensionAPI) {
  pi.registerCommand('init', {
    description: 'Create AGENTS.md for this project; use --force to update existing guidance',
    async handler(args, ctx) {
      // The harness launcher keeps executable project configuration untrusted.
      // This reviewed handler only checks for AGENTS.md and sends a user prompt;
      // generation uses our guarded tools. Override trust only for this call,
      // without granting project trust to Pi or loading project extensions.
      await handleInitCommand(pi, args, { ...ctx, isProjectTrusted: () => true });
    },
  });
}
