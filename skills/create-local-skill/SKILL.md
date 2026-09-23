---
name: create-local-skill
description: Create or refine a reusable skill, including focused instructions and optional helper scripts. Use when the user asks to teach the agent a repeatable workflow.
---

Default to a shared skill under `~/.pi/agent/skills/<name>/` (or the configured Pi agent directory). For workspace-specific workflows, use `.pi/skills/<name>/` or `skills/<name>/` in that workspace. Use the file write/edit tools to create shared skills; command sandboxes can read shared skills but cannot modify private Pi state. Keep the required `SKILL.md` concise: frontmatter needs a descriptive lowercase-hyphen name and a description stating when the skill applies.

First identify what the skill should change about the agent's decisions. Preserve the user's task and authorization boundaries. Avoid generic advice, repeated policy, and instructions that apply to unrelated work. Ask only for missing information that materially affects the result.

For scaffolding in a writable workspace staging directory, use `scripts/init.mjs <directory> <name> <description>` from this skill's directory to initialize a new skill. This helper refuses to overwrite existing files. Add scripts only when deterministic execution improves reliability; place lengthy conditional guidance in references linked from SKILL.md. Do not generate Codex-specific UI metadata.

Refine existing skills in place. Validate with `scripts/validate.mjs <skill-directory>`, then inspect a realistic request to ensure the skill selects the right workflow. Structural validation does not establish behavioral correctness. Run new helper scripts on disposable fixtures when relevant. Every command remains subject to user approval and sandboxing.

Report the created path, intended trigger, and what was validated. Restart or reload the harness session to discover newly created skills.
