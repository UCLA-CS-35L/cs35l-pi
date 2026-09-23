import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { root } from '../lib/paths.mjs';

const bin = join(homedir(), '.local', 'bin');
const destination = join(bin, 'cs35l-pi');
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const template = readFileSync(join(root, 'scripts/cs35l-pi.sh'), 'utf8');
mkdirSync(bin, { recursive: true });
writeFileSync(destination, template.replace('@CS35L_PI_ROOT@', () => shellQuote(root)), { mode: 0o755 });
chmodSync(destination, 0o755);
console.log(`Installed ${destination}\nRun cs35l-pi from your project directory. Ensure ${bin} is on PATH.`);
