import { dirname } from 'node:path';

// Keep command lookup independent of the caller's PATH and shell startup files.
export function sandboxPlatform(platform = process.platform) {
  if (platform === 'darwin') return {
    required: ['sandbox-exec'],
    paths: ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'],
    privateRoots: ['/Users', '/System/Volumes/Data/Users', '/private/var/folders', '/var/folders'],
    locale: 'en_US.UTF-8',
    setupHint: 'macOS requires /usr/bin/sandbox-exec. Run on a Mac with Seatbelt available; do not disable the sandbox.',
  };
  if (platform === 'linux') return {
    required: ['bwrap', 'socat'],
    paths: ['/usr/local/cs/bin', '/usr/local/bin', '/usr/bin', '/bin'],
    privateRoots: ['/home', '/root', '/run/user'],
    locale: 'C.UTF-8',
    setupHint: 'Ubuntu: sudo apt install bubblewrap socat. RHEL9: sudo dnf install bubblewrap socat (or ask the lab administrator). Do not disable the sandbox.',
  };
  throw new Error(`Unsupported platform: ${platform}. Use Linux, WSL2, or macOS with Seatbelt.`);
}

export function commandPath(rgPath, platform = process.platform) {
  return [...new Set([dirname(rgPath), dirname(process.execPath), ...sandboxPlatform(platform).paths])].join(':');
}
