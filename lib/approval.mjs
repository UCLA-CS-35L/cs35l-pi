import net from 'node:net';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, rmSync } from 'node:fs';
const LIMIT = 64 * 1024;
export function validateRequest(value) {
  if (!value || typeof value.command !== 'string' || !value.command.trim() || value.command.length > 32000) throw new Error('Invalid command');
  if (typeof value.cwd !== 'string' || typeof value.agent !== 'string' || value.agent.length > 200) throw new Error('Invalid execution identity');
  const domains = value.domains ?? [];
  if (value.networkAccess !== undefined && typeof value.networkAccess !== 'boolean') throw new Error('networkAccess must be a boolean');
  if (!Array.isArray(domains) || domains.length > 20 || domains.some(d => typeof d !== 'string' || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(d))) throw new Error('Use explicit DNS hostnames, without wildcards or URLs');
  return { command: value.command, cwd: value.cwd, agent: value.agent, domains, networkAccess: value.networkAccess === true, readOnly: value.readOnly === true };
}
export class ApprovalBroker {
  token = randomBytes(32).toString('hex');
  queue = Promise.resolve();
  clients = new Set();
  constructor(socketPath, decide, timeoutMs = 600000) { this.socketPath = socketPath; this.decide = decide; this.timeoutMs = timeoutMs; }
  async start() {
    this.server = net.createServer(socket => {
      this.clients.add(socket);
      const abort = new AbortController();
      const timer = setTimeout(() => socket.destroy(), this.timeoutMs);
      socket.once('close', () => { clearTimeout(timer); abort.abort(); this.clients.delete(socket); });
      socket.on('error', () => {});
      let buffer = '', received = false;
      socket.on('data', bytes => {
        if (received) return;
        buffer += bytes.toString();
        if (Buffer.byteLength(buffer) > LIMIT) { socket.destroy(); return; }
        if (!buffer.includes('\n')) return;
        received = true;
        this.queue = this.queue.then(async () => {
          if (abort.signal.aborted) return;
          let result = { approved: false };
          try {
            const data = JSON.parse(buffer.split('\n')[0]);
            const candidate = Buffer.from(String(data.token));
            const expected = Buffer.from(this.token);
            if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) throw new Error('Invalid approval channel');
            const request = validateRequest(data.request);
            result = await this.decide(request, abort.signal);
          } catch { /* A failed approval is a denial, never a fallback. */ }
          if (!abort.signal.aborted) socket.end(JSON.stringify(result) + '\n');
        }).catch(() => socket.destroy());
      });
    });
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(this.socketPath, resolve); });
    chmodSync(this.socketPath, 0o600);
    return this;
  }
  async close() {
    for (const socket of this.clients) socket.destroy();
    if (this.server?.listening) await new Promise(resolve => this.server.close(resolve));
    rmSync(this.socketPath, { force: true });
  }
}
export function requestApproval(socketPath, token, request, signal, timeoutMs = 600000) {
  validateRequest(request);
  if (!socketPath || !token) return Promise.reject(new Error('No user approval channel'));
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let buffer = '', settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel); socket.destroy();
      error ? reject(error) : resolve(value);
    };
    const cancel = () => finish(new Error('Approval cancelled'));
    const timer = setTimeout(() => finish(new Error('Approval timed out')), timeoutMs);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    socket.once('connect', () => socket.write(JSON.stringify({ token, request }) + '\n'));
    socket.on('data', data => {
      buffer += data;
      if (buffer.length > LIMIT) return finish(new Error('Invalid approval response'));
      if (!buffer.includes('\n')) return;
      try {
        const result = JSON.parse(buffer.split('\n')[0]);
        if (result.approved !== true) return finish(new Error('Command denied by user'));
        const grant = validateRequest({ ...request, domains: result.domains ?? [], networkAccess: result.networkAccess ?? false });
        finish(null, { approved: true, readOnly: result.readOnly === true, domains: grant.domains, networkAccess: grant.networkAccess });
      } catch { finish(new Error('Invalid approval response')); }
    });
    socket.on('error', error => finish(error));
    socket.on('end', () => finish(new Error('Approval channel closed')));
  });
}
