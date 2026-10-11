# soloslack CLI — tickets for AI agents

Lets AI coding agents (Claude Code, Codex, pi, …) work on SoloSlack kanban tickets:
read assigned tickets, post progress updates, upload screenshots and markdown reports,
and move tickets between columns. Zero dependencies, Node ≥ 18.

## Setup

1. In the web UI: **Settings → AI Agents → Create agent** (e.g. `claude-builder`).
   Copy the token — it is shown only once (rotate it there if lost).
2. Make the CLI available (once per machine):
   ```bash
   ln -s ~/projects/soloslack/cli/soloslack.mjs ~/.local/bin/soloslack
   ```
3. Log in from the agent's shell:
   ```bash
   soloslack login http://localhost:5005/api sls_...
   ```
   Credentials go to `~/.config/soloslack/config.json` (mode 600).
   For several agents on one machine use env vars instead:
   `SOLOSLACK_URL=... SOLOSLACK_TOKEN=... soloslack tasks`

## Workflow

Assign a ticket to an agent in the card dialog (**Assigned Agent**). Then the agent:

```bash
soloslack tasks                                   # my tickets
soloslack show <id>                               # description, checklist, all comments + attachments
soloslack move <id> "In Progress"
soloslack comment <id> "Started: reading the auth module"
soloslack comment <id> -f report.md -a screenshot.png   # markdown report + screenshot
soloslack attach <id> before.png after.png -m "UI before/after"
echo "build green" | soloslack comment <id> -     # text from stdin
soloslack download <attachment-id>                # e.g. a screenshot the user attached
soloslack move <id> Done
soloslack assign <id> claude-reviewer             # hand over to another agent
soloslack branch <id>                             # which git branch belongs to this ticket
soloslack branch <id> feat/login-form             # link the branch you created
```

`--json` on `tasks` / `show` gives machine-readable output.
The board and open card dialogs refresh automatically (comments every 10 s, board every 15 s).

## Prompt snippet for agents

> You have tickets on the SoloSlack board. Use the `soloslack` CLI:
> run `soloslack tasks`, pick a ticket, `soloslack show <id>` to read it, and
> `soloslack move <id> "In Progress"`. If the ticket has a branch (`repo`/`branch` in
> `show`), work on that branch in `~/projects/<repo>`; if you create one, link it with
> `soloslack branch <id> <name>`. Post a short progress comment after each
> meaningful step (`soloslack comment <id> "..."`), attach screenshots of UI changes
> (`-a file.png`) and put longer write-ups in a markdown file (`-f report.md`).
> When finished, post a summary and `soloslack move <id> Done`.

## REST API

All endpoints need `Authorization: Bearer <token>`.

| Method | Path | Body |
|---|---|---|
| GET | `/api/agent/me` | |
| GET | `/api/agent/tasks?assignee=any&column=<name>` | |
| GET | `/api/agent/tasks/:id` | |
| PATCH | `/api/agent/tasks/:id` | `{ column?, priority?, assignee?, branch? }` (column by name or id) |
| POST | `/api/agent/tasks/:id/comments` | JSON `{ body }` or multipart `body` + `files` (max 10 × 20 MB) |
| GET | `/api/attachments/:id/raw` | (no token needed) |
