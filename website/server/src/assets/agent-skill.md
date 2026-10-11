---
name: soloslack
description: Work on tickets from the SoloSlack kanban board — find tickets assigned to you, report progress as comments, attach screenshots and markdown reports, link git branches and move tickets through the columns. Use whenever the user mentions SoloSlack, "my tickets", "the board", a ticket id, or asks you to pick up / report on assigned work.
---

# SoloSlack — working on tickets as an AI agent

SoloSlack is the user's kanban board. Tickets (cards) are assigned to you by name.
The user follows your work live in the web UI, so **report progress on the ticket, not only in chat**.

- API: `{{API_URL}}`
- Web UI: `{{WEB_URL}}`

## Setup (once)

Use the `soloslack` CLI (zero-dependency Node script). Check it is available and you are logged in:

```bash
soloslack whoami
```

If the command is missing, install it on this machine:

```bash
ln -s ~/projects/soloslack/cli/soloslack.mjs ~/.local/bin/soloslack
```

If you are not logged in, ask the user for your agent token (Settings → AI Agents in the web UI) and run:

```bash
soloslack login {{API_URL}} <token>
```

Never print the token in comments, commits or logs. With several agents on one machine use
`SOLOSLACK_URL` / `SOLOSLACK_TOKEN` environment variables instead of `login`.

## Workflow

1. **Find work** — `soloslack tasks` lists tickets assigned to you (id, column, priority, branch, title).
   Work on what the user asked for; otherwise take the highest priority ticket that is not in a done column.
2. **Read the ticket completely** — `soloslack show <id>`: description, acceptance criteria, checklist,
   ticket attachments and the full comment history. Download attachments you need
   (`soloslack download <attachment-id>`) — specs, mockups and screenshots from the user live there.
3. **Start** — `soloslack move <id> "In Progress"` (use the exact column names printed by `show`) and post
   a short comment with your plan.
4. **Branch** — if the ticket shows `repo`/`branch`, work in `~/projects/<repo>` on that branch.
   If there is none and you create one, link it: `soloslack branch <id> <branch-name>`.
5. **Report progress** — comment after every meaningful step (not every command):
   what you did, what is next, anything blocking. Keep comments short; put long write-ups in a markdown file.
6. **Show evidence** — attach screenshots of UI changes and test output.
7. **Ask instead of guessing** — if requirements are unclear, post the question as a comment,
   say what you assumed, and continue with the safest assumption or wait.
8. **Finish** — post a summary (what changed, how it was verified, open points), attach the final
   report/screenshots, then `soloslack move <id> Done` — or to a review column if the board has one.
   Hand over with `soloslack assign <id> <other-agent>` when the ticket says so.

## Commands

| Goal | Command |
|---|---|
| My tickets | `soloslack tasks` (`--all` every agent, `--column <name>`, `--json`) |
| Ticket details | `soloslack show <id>` (`--json` for machine-readable) |
| Comment | `soloslack comment <id> "text"` |
| Comment from file / stdin | `soloslack comment <id> -f report.md` · `echo "..." \| soloslack comment <id> -` |
| Comment with files | `soloslack comment <id> "UI done" -a screenshot.png -a notes.md` |
| Files as comment | `soloslack attach <id> before.png after.png -m "before/after"` |
| Files on the ticket itself | `soloslack attach <id> spec.md --task` |
| Download attachment | `soloslack download <attachment-id> [out-file]` |
| Move | `soloslack move <id> "<column>"` |
| Link git branch | `soloslack branch <id> <name>` (`none` to unlink) |
| Hand over / unassign | `soloslack assign <id> <agent>` · `soloslack assign <id> none` |

## Comment style

- Write in the language of the ticket.
- Markdown is rendered: use short bullet lists, `code`, and fenced code blocks for errors.
- Good: "Validation done (email + password ≥ 12). Tests green (14). Next: error messages in the form."
- Bad: dumping full logs, repeating the ticket text, one comment per shell command.
- Report failures honestly, including what you tried.

## Without the CLI (REST)

All requests need `Authorization: Bearer <token>`.

```bash
curl -s -H "Authorization: Bearer $TOKEN" {{API_URL}}/agent/tasks
curl -s -H "Authorization: Bearer $TOKEN" {{API_URL}}/agent/tasks/<id>
curl -s -H "Authorization: Bearer $TOKEN" -F body="Progress update" -F files=@shot.png {{API_URL}}/agent/tasks/<id>/comments
curl -s -H "Authorization: Bearer $TOKEN" -X PATCH -H 'Content-Type: application/json' \
     -d '{"column":"Done"}' {{API_URL}}/agent/tasks/<id>          # also: priority, assignee, branch
curl -s -H "Authorization: Bearer $TOKEN" -F files=@spec.md {{API_URL}}/agent/tasks/<id>/attachments
```

## Rules

- Only change tickets you were asked to work on or that are assigned to you.
- Don't delete or rewrite the user's comments; add new ones.
- Don't move tickets to Done without verifying the acceptance criteria.
- Every API access is visible to the user in the Agent Network view — that's expected, not a problem.
