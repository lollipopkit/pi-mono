# AI Approval Extension

A Codex-style approval cascade for tool calls. Before any non-read-only tool runs
(`bash` / `edit` / `write` / configured custom tools), the extension decides what to
do — auto-approve safe work, reject dangerous work, optionally let an LLM judge the
gray area, and otherwise ask you.

Inspired by codex's approval model (`AskForApproval` + `is_known_safe_command`),
ported to TypeScript. See `references/codex/codex-rs/core/src/safety.rs` and
`references/codex/codex-rs/shell-command/src/command_safety/is_safe_command.rs`.

## Decision cascade

For each in-scope tool call, in order:

1. **Deny rule match** → reject (deny always wins, even over a session approval).
2. **Known-safe command** → auto-approve. Read-only bash commands only
   (`cat`, `ls`, `grep`, `git status`, `find` without `-exec/-delete`, …).
3. **Allow rule match** → auto-approve.
4. **AI approval** (opt-in) → an LLM returns `allow` / `deny`.
5. **Fallback** → prompt you. With no interactive UI (e.g. `pi -p`), it rejects.

Read-only tools (`read`, `grep`, `find`, `ls`, …) are never gated.

## Usage

```bash
pi -e ./approval                 # enabled, config-driven
pi -e ./approval --ai-approval   # force-enable the AI approval layer
pi -e ./approval --no-approval   # disable for this run
```

To install permanently, copy this directory to `~/.pi/agent/extensions/approval/`.

### Slash commands

- `/approval` — show current configuration
- `/approval on` | `/approval off` — enable/disable approval
- `/approval ai on` | `/approval ai off` — toggle the AI approval layer

When prompted, you can choose **Approve for session** to auto-approve that exact
command for the rest of the session (codex's "approved for session" behavior).

## Configuration

Merged, project takes precedence:

- `~/.pi/agent/extensions/approval.json` (global)
- `<cwd>/.pi/approval.json` (project-local)

```jsonc
{
  "enabled": true,
  "aiApproval": false,
  // Model for the AI layer. null → try a model named "code-auto-review", then the
  // current session model. Accepts a bare id or "provider/id".
  "aiModel": null,
  // Tools that go through the cascade. Use "*" for every non-read-only tool.
  "tools": ["bash", "edit", "write"],
  // Regex rules (case-insensitive, whole-string test).
  "allow": ["^npm (run|test)\\b", "^git (status|diff|log)\\b"],
  "deny": ["\\brm\\s+-[a-z]*[rf]", "\\bsudo\\b", "(chmod|chown)\\s+\\S*\\s*777"],
  "rememberForSession": true
}
```

If `deny` / `allow` are omitted, a conservative default deny list applies
(`rm -rf`, `sudo`, `chmod 777`, `mkfs`, `dd if=`, `shutdown`, fork bomb, …) and the
allow list is empty.

### AI approval model resolution

1. `aiModel` from config, if set and resolvable.
2. A registered model named/aliased `code-auto-review`.
3. The current session model.

The AI layer returns a strict `allow` / `deny`. On any error (no model/auth, request
failure, unparseable answer) it falls back to the user prompt, or denies when there is
no UI — never silently approves.

## Notes

- `safety.ts` and `engine.ts` are dependency-free and unit-tested in
  `test/approval-cascade.test.ts`.
- The cascade never overrides an explicit **deny** — a session approval or an allow
  rule cannot re-enable a denied command.
