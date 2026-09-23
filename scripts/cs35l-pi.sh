#!/usr/bin/env bash
set -euo pipefail
# Replaced with the absolute checkout path when installed.
readonly cs35l_pi_root=@CS35L_PI_ROOT@
export PATH="/usr/local/cs/bin:$PATH"
if (( $# > 1 )) || { (( $# == 1 )) && [[ "$1" != resume ]]; }; then
  echo 'Usage: cs35l-pi [resume]' >&2
  exit 2
fi
if [[ ! -f "$cs35l_pi_root/package.json" ]]; then
  echo 'CS35L Pi checkout has moved or been removed. Rerun its install.sh.' >&2
  exit 1
fi
# npm runs its start script in the package directory, so pass the caller's
# directory explicitly. Quoting preserves spaces and shell metacharacters.
if [[ "${1:-}" == resume ]]; then
  exec npm --prefix "$cs35l_pi_root" start -- --resume "$PWD"
fi
exec npm --prefix "$cs35l_pi_root" start -- "$PWD"
