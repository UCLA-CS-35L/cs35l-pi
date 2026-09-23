# CS35L Pi

A Pi coding harness with training wheels. Uses `openrouter/free` by default; bring your own provider account or API key.

## Features

| Command or tool               | What it does                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `/init`                       | Create project instructions in `AGENTS.md`.                                   |
| `/plan`                       | Investigate and plan with read-only workspace access.                         |
| `/goal`                       | Work toward an explicitly requested goal across turns.                        |
| `/btw`                        | Open a temporary side conversation.                                           |
| `/skill:create-local-skill`   | Create reusable skills, shared or workspace-specific.                         |
| `subagent`                    | Delegate investigation to read-only scouts and reviewers.                     |
| `ask_user`                    | Let the agent ask questions during a turn.                                    |
| `memory_read`, `memory_write` | Recall shared memory; save it when requested.                                 |
| `bash`, `!`                   | Run sandboxed commands with per-command approval and optional network access. |
| `cs35l-pi resume`             | Search saved sessions across workspaces and resume one.                       |

Also includes Pi's built-in `/fork`, `/compact`, automatic compaction, and `AGENTS.md` support. Auth, memory, sessions, and saved model/thinking preferences live under `~/.pi/agent/`.

## Dependencies

- Node.js **22.21+**, npm, Git, and Bash.
- **Ubuntu:** `sudo apt install bubblewrap socat`
- **RHEL:** `sudo dnf install bubblewrap socat` (or ask your administrator).
- **macOS (experimental):** built-in Seatbelt; no bubblewrap or socat required.

Linux requires working unprivileged user namespaces. Ripgrep is installed through npm. On the RHEL lab machines, Node is available in `/usr/local/cs/bin`.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/UCLA-CS-35L/cs35l-pi/HEAD/install.sh | bash
export PATH="$HOME/.local/bin:$PATH" # add to your shell startup file
cd /path/to/your/project
cs35l-pi
```

Installs to `~/.pi/repo/cs35l-pi`. Rerun the curl command to upgrade with rebase and autostash. From a cloned checkout, run `bash install.sh` instead.

## Models

You need to bring your own account or API key. Use `/login` to connect it and `/model` to choose a model.

- **Anthropic or OpenAI:** use your existing Claude Pro/Max or ChatGPT Plus/Pro subscription through Pi's account login.
- **Neither subscription?** Create an [OpenRouter](https://openrouter.ai/) account and use its free models: **50 requests per day**, increasing to **1,000 per day** after a one-time purchase of at least **$10 in credits**. See the [current limits](https://openrouter.ai/docs/api/reference/limits).
- **Paid open-source models:** OpenRouter also offers paid inference for open-source models using the same account and credits.

The free 50 requests may cover roughly **1–2 hours of light coursework per day**, depending on how often you use the agent. **You do not need to spend anything if you do not want to.** The default is `openrouter/free`. Limits count model requests; one agent task can make several requests.

## Extending the harness

You can use Pi to extend itself, add features you want, and change any configuration you want.

Licensed under [GPLv3](LICENSE).
