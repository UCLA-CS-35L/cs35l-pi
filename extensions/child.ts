import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import guard from './guard.ts';
export default function (pi: ExtensionAPI) { guard(pi, true); }
