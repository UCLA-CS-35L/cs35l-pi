#!/usr/bin/env bash
# HTTPS lets users install without configuring GitHub SSH keys.
CS35L_REPO_URL="${CS35L_REPO_URL:-https://github.com/UCLA-CS-35L/cs35l-pi.git}"
CS35L_REPO_REF="${CS35L_REPO_REF:-HEAD}" # Remote default branch, or pin a branch/tag/commit.
CS35L_INSTALL_DIR="${CS35L_INSTALL_DIR:-$HOME/.pi/repo/cs35l-pi}"

set -euo pipefail
cs35l_stage=''
cs35l_check_dir=''

fail() { printf '%s\n' "$*" >&2; exit 1; }

check_sandbox_dependencies() {
  local system missing='' id='' like=''
  system=$(uname -s)
  case "$system" in
    Darwin) return ;; # Seatbelt is checked by the doctor; no bwrap/socat needed.
    Linux) ;;
    *) fail 'Supported platforms: Linux, WSL2, and macOS.' ;;
  esac
  command -v bwrap >/dev/null 2>&1 || missing="$missing bubblewrap"
  command -v socat >/dev/null 2>&1 || missing="$missing socat"
  if [[ -z "$missing" ]]; then return; fi
  printf 'Missing Linux sandbox packages:' >&2
  printf '%s' "$missing" >&2
  printf '\n' >&2
  if [[ -r /etc/os-release ]]; then
    # OS-owned metadata, not configuration from the project being installed.
    id=$(. /etc/os-release; printf '%s' "${ID:-}")
    like=$(. /etc/os-release; printf '%s' "${ID_LIKE:-}")
  fi
  case " $id $like " in
    *' ubuntu '*|*' debian '*)
      printf 'Install them with:\n  sudo apt install' >&2
      printf '%s' "$missing" >&2
      printf '\n' >&2 ;;
    *' rhel '*|*' fedora '*|*' centos '*|*' rocky '*|*' almalinux '*)
      printf 'Install them with:\n  sudo dnf install' >&2
      printf '%s' "$missing" >&2
      printf '\n' >&2 ;;
    *) printf 'Install the listed packages using your distribution package manager.\n' >&2 ;;
  esac
  fail 'Then rerun this installer. On managed machines, ask the administrator. No system packages were installed.'
}

main() {
  (( $# == 0 )) || fail 'Usage: bash install.sh (configuration is at the top or supplied through environment variables)'
  # Lab Node and common Homebrew installations; retain the user's chosen tools.
  export PATH="$PATH:/usr/local/cs/bin:/opt/homebrew/bin:/usr/local/bin"
  check_sandbox_dependencies
  command -v node >/dev/null 2>&1 || fail 'Node >=22.21 is required. Install Node and npm, then rerun.'
  node --input-type=module -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22 || (a===22 && b<21)) process.exit(1)' </dev/null || fail 'Node >=22.21 is required.'
  command -v npm >/dev/null 2>&1 || fail 'npm is required.'

  local source_dir='' checkout install_parent
  if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
    source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
  fi
  # Keep a developer's checkout in place. A piped/downloaded standalone script
  # bootstraps a checkout under ~/.pi/repo instead.
  if [[ -n "$source_dir" && -f "$source_dir/lib/session.mjs" && -f "$source_dir/scripts/install-launcher.mjs" ]]; then
    checkout=$source_dir
    printf 'Installing from checkout: %s\n' "$checkout"
  else
    [[ -n "$CS35L_REPO_URL" ]] || fail 'Set CS35L_REPO_URL at the top of install.sh (or in the environment) before using the piped installer.'
    command -v git >/dev/null 2>&1 || fail 'git is required to download the repository.'
    case "$CS35L_INSTALL_DIR" in /*) ;; *) fail 'CS35L_INSTALL_DIR must be an absolute path.' ;; esac
    checkout=$CS35L_INSTALL_DIR
    if [[ -e "$checkout" || -L "$checkout" ]]; then
      [[ -d "$checkout/.git" && -f "$checkout/lib/session.mjs" && -f "$checkout/scripts/install-launcher.mjs" ]] || fail "Install destination already exists and is not a harness checkout: $checkout"
      [[ "$(git -C "$checkout" remote get-url origin)" == "$CS35L_REPO_URL" ]] || fail 'Existing checkout has a different origin; choose another CS35L_INSTALL_DIR.'
      printf 'Updating checkout with rebase and autostash: %s\n' "$checkout"
      if ! git -C "$checkout" pull --rebase --autostash origin "$CS35L_REPO_REF" </dev/null; then
        fail "Upgrade stopped. Resolve Git's reported issue in $checkout, then rerun. Your checkout and any autostash have been left intact."
      fi
      # Git can exit successfully when applying the autostash leaves conflicts.
      [[ -z "$(git -C "$checkout" ls-files --unmerged)" ]] || fail "Autostash restore has conflicts in $checkout. Resolve them before rerunning setup."
    else
      install_parent=$(dirname -- "$checkout")
      mkdir -p -- "$install_parent"
      cs35l_stage=$(mktemp -d "$install_parent/.cs35l-pi-install.XXXXXX")
      trap '[[ -z "$cs35l_stage" ]] || rm -rf -- "$cs35l_stage"; [[ -z "$cs35l_check_dir" ]] || rm -rf -- "$cs35l_check_dir"' EXIT
      git init -q "$cs35l_stage"
      git -C "$cs35l_stage" remote add origin "$CS35L_REPO_URL"
      git -C "$cs35l_stage" fetch --depth 1 origin "$CS35L_REPO_REF" </dev/null
      git -C "$cs35l_stage" checkout -b cs35l-installed FETCH_HEAD </dev/null
      [[ -f "$cs35l_stage/package-lock.json" && -f "$cs35l_stage/lib/session.mjs" && -f "$cs35l_stage/scripts/install-launcher.mjs" ]] || fail 'Repository does not contain the expected harness at its root.'
      mv -- "$cs35l_stage" "$checkout"
      cs35l_stage=''
    fi
  fi

  cd -- "$checkout"
  # Checks use disposable workspace/state outside ~/.pi. Never seed a sample
  # project inside the private installation or read the user's auth to test setup.
  cs35l_check_dir=$(mktemp -d "${TMPDIR:-/tmp}/cs35l-install-check.XXXXXX")
  trap '[[ -z "$cs35l_stage" ]] || rm -rf -- "$cs35l_stage"; [[ -z "$cs35l_check_dir" ]] || rm -rf -- "$cs35l_check_dir"' EXIT
  mkdir -- "$cs35l_check_dir/work"
  npm ci </dev/null
  CS35L_STATE_DIR="$cs35l_check_dir/state" npm run doctor </dev/null
  CS35L_STATE_DIR="$cs35l_check_dir/state" npm run check -- "$cs35l_check_dir/work" </dev/null
  node scripts/install-launcher.mjs </dev/null
  printf '\nReady. From your project directory, run cs35l-pi or cs35l-pi resume.\n'
  printf 'If needed, add this to your shell startup file:\n  export PATH="$HOME/.local/bin:$PATH"\n'
}

# Keep execution last so curl | bash reads all function definitions first.
main "$@"
