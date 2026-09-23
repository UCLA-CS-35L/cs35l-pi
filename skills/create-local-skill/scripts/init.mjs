import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const [base, name, description] = process.argv.slice(2);
if (!base || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name ?? '') || name.length > 63 || !description?.trim()) throw new Error('Usage: node init.mjs <parent-directory> <lowercase-hyphen-name> <description>');
const target = resolve(base, name);
mkdirSync(target); // Intentionally refuse to overwrite an existing skill.
writeFileSync(join(target, 'SKILL.md'), `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n\nDescribe the task-specific workflow and validation here.\n`, { flag: 'wx' });
console.log(target);
