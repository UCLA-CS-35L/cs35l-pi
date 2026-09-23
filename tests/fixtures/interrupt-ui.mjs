// A real interactive Pi session backed by a deliberately stalled local model.
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const base = process.argv[2];
process.env.CS35L_STATE_DIR = join(base, 'state');
process.env.PI_CODING_AGENT_DIR = join(base, 'pi');
process.env.PI_OFFLINE = '1';
const work = join(base, 'work'); mkdirSync(work);
let requests = 0;
const server = createServer(async (req, res) => {
  for await (const chunk of req) { /* drain the request */ }
  const number = ++requests;
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const chunk = (delta, finish_reason = null) => res.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
  chunk({ role: 'assistant', content: number === 1 ? 'Waiting for interruption.' : 'READY_AFTER_INTERRUPT' });
  if (number === 1) {
    writeFileSync(join(base, 'started'), '');
    res.on('close', () => writeFileSync(join(base, 'cancelled'), ''));
  } else {
    chunk({}, 'stop'); res.end('data: [DONE]\n\n');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { prepareEnvironment } = await import('../../lib/environment.mjs');
const { createHarnessRuntime } = await import('../../lib/session.mjs');
const { InteractiveMode } = await import('@earendil-works/pi-coding-agent');
const paths = prepareEnvironment(work);
writeFileSync(join(paths.agentDir, 'models.json'), JSON.stringify({ providers: { fixture: { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'fixture-only', models: [{ id: 'fixture', name: 'fixture', contextWindow: 32000, maxTokens: 1024 }] } } }));
process.chdir(work);
const result = await createHarnessRuntime(paths, { providerId: 'fixture', modelId: 'fixture' });
result.session.subscribe(event => {
  if (event.type === 'agent_end') writeFileSync(join(base, `idle-${requests}`), '');
});
const mode = new InteractiveMode(result.runtime);
await mode.init();
writeFileSync(join(base, 'ready'), '');
await mode.run();
