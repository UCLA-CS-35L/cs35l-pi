import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { matchesKey } from '@earendil-works/pi-tui';

export default function interrupt(pi: ExtensionAPI) {
  let unsubscribe: (() => void) | undefined;
  let requested = false;
  let lastIdleCtrlC = 0;

  pi.on('session_start', (_event, ctx) => {
    unsubscribe?.();
    requested = false;
    lastIdleCtrlC = 0;
    if (!ctx.hasUI) return;
    unsubscribe = ctx.ui.onTerminalInput(data => {
      if (!matchesKey(data, 'ctrl+c')) return;
      if (ctx.isIdle()) {
        const now = Date.now();
        // Match Pi's native double-press window; let Pi clear/exit normally.
        if (now - lastIdleCtrlC >= 500) {
          ctx.ui.notify('Press Ctrl+C again within 0.5 seconds to exit Pi.', 'info');
          lastIdleCtrlC = now;
        }
        return;
      }
      if (!requested) {
        requested = true;
        ctx.ui.setStatus('interrupt', 'Interrupt requested — stopping…');
        ctx.ui.notify('Interrupt requested — stopping…', 'warning');
        ctx.abort();
      }
      // Do not also clear the editor or trigger Pi's double-Ctrl+C exit.
      return { consume: true };
    });
  });

  pi.on('agent_start', (_event, ctx) => {
    requested = false;
    ctx.ui.setStatus('interrupt', undefined);
  });
  pi.on('agent_end', (_event, ctx) => {
    if (!requested) return;
    requested = false;
    ctx.ui.setStatus('interrupt', 'Interrupted — ready for another prompt');
    ctx.ui.notify('Interrupted — ready for another prompt', 'info');
  });
  pi.on('session_shutdown', () => {
    unsubscribe?.();
    unsubscribe = undefined;
  });
}
