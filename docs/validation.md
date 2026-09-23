# Prototype validation — 2026-09-23

Local Linux x64, Node 22.23.2: clone installer, doctor, extension lifecycle check,
and interactive terminal startup/exit succeeded. The bundled skill passes its
structural validator. No authenticated provider requests were made.

RHEL9 lnxsrv15: Node 25.5.0 at /usr/local/cs/bin/node; system bwrap and socat;
npm @vscode/ripgrep 1.18.0 supplies ripgrep 15.0.0. Doctor runs successfully.
Canonicalizing the lab's symlinked home directory fixed a bubblewrap mount failure.
The runtime was transferred to a temporary directory, not permanently installed.
The clone installer itself was exercised locally.

All 12 tests pass locally and on lnxsrv15. They cover approval isolation,
cancellation, serialized requests, headless denial, real Pi lifecycle/plan mode,
filesystem confinement, network denial, symlink escapes, and subagent input policy.
A real detached child uses a local scripted model endpoint to verify supervisor
clarification/reply, parent UI command approval, and read-only child execution.

Live Big Pickle/OpenAI/Anthropic behavior, account limits, domain exceptions across
services, prolonged goal and compaction/resume workflows, WSL2, and 60-student load
remain release tests. macOS Seatbelt support is implemented for testing; macOS 15 Apple Silicon and Intel CI jobs are configured but have not been executed from this workspace. Git metadata restrictions are documented
in README.md.

## macOS preparation

The earlier lab results above describe the Linux prototype at that time.
The current changes enable Seatbelt on macOS, platform-specific dependency
checks, canonical private-directory rules, Homebrew and the launching Node's
binary directory on command PATH, and a macOS UTF-8 locale. CI runs the same
suite on Ubuntu 22.04, macOS 15 ARM64, and macOS 15 Intel without skipping
sandbox tests. Mac jobs require working Seatbelt; no unsandboxed fallback exists.

New checks exercise actual file operations rather than treating hidden metadata
as the security boundary, compile/run C, execute Python/Node/Bash, and verify
proxy-mediated networking while direct TCP remains denied. Testing also exposed
and fixed Linux proxy sockets being hidden by the /tmp read deny: only the
per-invocation bridge socket paths are re-allowed. A path canonicalization bug
for nonexistent top-level components was fixed as well.

These changes have not been exercised on macOS or re-tested on lnxsrv15 yet.
A successful Linux test run does not validate Seatbelt enforcement. On a Mac,
run `bash install.sh` followed by `npm test`, then check interactive command
approval, network choices, Ctrl+C, and `cs35l-pi resume` in a real terminal.
